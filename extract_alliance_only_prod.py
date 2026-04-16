import boto3
import csv
from boto3.dynamodb.conditions import Key, Attr

# Configuration
GENESIS_PASS_CONTRACT = "0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1".lower()
REGION = "ap-northeast-2"
PROFILE = "nasun-prod" # Production profile

session = boto3.Session(profile_name=PROFILE)
dynamodb = session.resource('dynamodb', region_name=REGION)

def get_all_items(table_name, **kwargs):
    table = dynamodb.Table(table_name)
    response = table.scan(**kwargs)
    items = response.get('Items', [])
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'], **kwargs)
        items.extend(response.get('Items', []))
    return items

def main():
    print(f"Fetching data from DynamoDB (Profile: {PROFILE})...")
    
    # 1. Get all ecosystem activations
    activations = get_all_items('nasun-ecosystem-activations')
    
    alliance_active = [] # List of (identityId, suiAddress)
    genesis_active_ids = set()
    
    for item in activations:
        if item.get('status') != 'ACTIVE':
            continue
            
        sk = item.get('sk', '')
        if sk.startswith('alliance#'):
            alliance_active.append({
                'identityId': item['identityId'],
                'suiAddress': sk.split('#')[1]
            })
        elif sk.startswith('genesis-pass#'):
            genesis_active_ids.add(item['identityId'])
            
    print(f"Found {len(alliance_active)} Alliance active users in production.")
    print(f"Found {len(genesis_active_ids)} Genesis Pass active users in production.")

    # 2. Get Genesis Pass holders from ownership snapshot
    ownership_table = dynamodb.Table('nasun-nft-ownership')
    response = ownership_table.query(
        KeyConditionExpression=Key('pk').eq('ETH#LATEST')
    )
    ownership_items = response.get('Items', [])
    while 'LastEvaluatedKey' in response:
        response = ownership_table.query(
            KeyConditionExpression=Key('pk').eq('ETH#LATEST'),
            ExclusiveStartKey=response['LastEvaluatedKey']
        )
        ownership_items.extend(response.get('Items', []))
        
    genesis_holder_wallets = set()
    for item in ownership_items:
        holdings = item.get('holdings', [])
        for h in holdings:
            if h.get('contractAddress', '').lower() == GENESIS_PASS_CONTRACT:
                if h.get('tokenCount', 0) > 0:
                    genesis_holder_wallets.add(item['walletAddress'].lower())
                    
    print(f"Found {len(genesis_holder_wallets)} Genesis Pass holder wallets in production.")

    # 3. Get User Wallets for mapping identityId to ETH wallet
    user_wallets = get_all_items('UserWallets', FilterExpression=Attr('blockchain').eq('ethereum'))
    id_to_eth = {item['identityId']: item['walletAddress'].lower() for item in user_wallets}
    
    # 4. Filter: Alliance Active AND NOT (Genesis Active OR Genesis Holder)
    final_list = []
    for user in alliance_active:
        iid = user['identityId']
        eth_wallet = id_to_eth.get(iid)
        
        # Exclude if Genesis Pass is activated
        if iid in genesis_active_ids:
            continue
            
        # Exclude if Genesis Pass is held in linked ETH wallet
        if eth_wallet and eth_wallet in genesis_holder_wallets:
            continue
            
        final_list.append({
            'identityId': iid,
            'suiAddress': user['suiAddress'],
            'ethWallet': eth_wallet if eth_wallet else 'N/A'
        })
        
    print(f"Final count of Alliance-only active users (PROD): {len(final_list)}")

    # 5. Save to CSV
    output_file = 'alliance_only_activations_prod.csv'
    with open(output_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['identityId', 'suiAddress', 'ethWallet'])
        writer.writeheader()
        writer.writerows(final_list)
        
    print(f"List saved to {output_file}")

if __name__ == "__main__":
    main()
