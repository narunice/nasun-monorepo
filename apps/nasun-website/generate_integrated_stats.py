import subprocess
import urllib.request
import json
import datetime
from collections import Counter
import time

# --- Configuration ---
SERVERS = [
    {
        "name": "NASUN (staging.nasun.io)",
        "host": "ubuntu@staging.nasun.io",
        "key": "/home/naru/.ssh/.awskey/naru_seoul.pem"
    },
    {
        "name": "GENSOL (staging.gensol.io)",
        "host": "ubuntu@staging.gensol.io",
        "key": "/home/naru/.ssh/.awskey/naru_seoul.pem"
    }
]

# 봇/데이터센터 필터링 키워드
BOT_KEYWORDS = [
    "Amazon", "AWS", "Google", "Microsoft", "Azure", "DigitalOcean", "Linode", 
    "Contabo", "Tencent", "Alibaba", "Oracle", "Hetzner", "OVH", "Leaseweb", 
    "Choopa", "Vultr", "Palo Alto", "Censys", "Shadowserver", "AI Spera", 
    "Ucloud", "Ace Data Centers", "Akamai", "Cloudflare", "Fastly", "CDN",
    "Datacenter", "Hosting", "Colocation", "Server", "Vpsville", "GTHost",
    "Host", "Scanner", "Research", "Lab", "University", "Institute",
    "M247", "FranTech", "BuyVM", "NFORCE", "Performive", "DataCamp", "HostRoyale",
    "IP Volume", "Private Customer", "Dedicated", "Solution", "Technology",
    "LLC", "Ltd", "Inc", "S.A", "GmbH", "B.V", "Corp", "Corporation", "Megapros"
]

# 화이트리스트 (가정용 ISP 등)
WHITELIST_KEYWORDS = [
    "Korea Telecom", "SK Broadband", "LG Uplus", "Kornet", "Comcast", "Verizon", 
    "AT&T", "T-Mobile", "Vodafone", "Deutsche Telekom", "Orange", "Telefonica",
    "Bite Lietuva", "Spectrum", "Cox", "Charter", "Shaw", "Telus", "Bell", "Rogers"
]

def get_dates():
    """오늘, 어제, 그저께 날짜 문자열 반환 (Nginx 로그 포맷: 24/Dec/2025)"""
    today = datetime.date.today()
    dates = []
    for i in range(3):
        d = today - datetime.timedelta(days=i)
        dates.append(d.strftime("%d/%b/%Y"))
    return dates

def is_real_user(org_name):
    """ISP 이름을 기반으로 실제 사용자인지 판단"""
    for kw in WHITELIST_KEYWORDS:
        if kw.lower() in org_name.lower():
            return True
    for kw in BOT_KEYWORDS:
        if kw.lower() in org_name.lower():
            return False
    return True # 기본적으로는 True로 두되, 결과를 보며 필터링 추가

def fetch_ips_from_server(server_conf, date_str):
    """SSH를 통해 서버에서 해당 날짜의 IP 목록을 가져옴"""
    # zgrep을 사용하여 압축된 로그와 일반 로그를 모두 검색
    cmd = f"zgrep -h '{date_str}' /var/log/nginx/*access.log* 2>/dev/null | awk '{{print $1}}'"
    
    ssh_cmd = [
        "ssh", 
        "-i", server_conf['key'], 
        "-o", "StrictHostKeyChecking=no", 
        server_conf['host'], 
        cmd
    ]
    
    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            # grep이 결과를 못 찾으면 exit code 1을 반환할 수 있음 (에러 아님)
            if not result.stdout:
                return []
            print(f"Warning fetching logs from {server_conf['name']}: {result.stderr}")
            return []
        
        return result.stdout.strip().split('\n')
    except Exception as e:
        print(f"Error SSH connection to {server_conf['name']}: {e}")
        return []

def enrich_ip_data(ip_list):
    """IP 리스트의 정보를 ip-api.com Batch API로 조회"""
    unique_ips = list(set(ip_list))
    if not unique_ips:
        return {}
        
    ip_info_map = {}
    batch_url = "http://ip-api.com/batch"
    
    # 100개씩 끊어서 요청
    for i in range(0, len(unique_ips), 100):
        chunk = unique_ips[i:i+100]
        try:
            req = urllib.request.Request(
                batch_url, 
                data=json.dumps(chunk).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req) as response:
                results = json.loads(response.read().decode())
                for res in results:
                    if 'query' in res:
                        ip_info_map[res['query']] = res
            time.sleep(0.5) # API Rate limit 보호
        except Exception as e:
            print(f"API Error: {e}")
            
    return ip_info_map

def main():
    target_dates = get_dates()
    
    print(f"Analyzing logs for: {', '.join(target_dates)}")
    print("-" * 60)

    for server in SERVERS:
        print(f"\n🚀 Target Server: {server['name']}")
        
        for date_str in target_dates:
            print(f"\n📅 Date: {date_str}")
            
            # 1. IP 가져오기
            raw_ips = fetch_ips_from_server(server, date_str)
            raw_ips = [ip for ip in raw_ips if ip] # 빈 문자열 제거
            
            if not raw_ips:
                print("   No traffic found.")
                continue
                
            total_hits = len(raw_ips)
            ip_counts = Counter(raw_ips)
            
            # 2. IP 정보 조회
            ip_info = enrich_ip_data(list(ip_counts.keys()))
            
            # 3. 필터링 및 출력
            real_users = []
            
            for ip, count in ip_counts.items():
                info = ip_info.get(ip, {})
                if info.get('status') == 'success':
                    org = info.get('org', info.get('isp', 'Unknown'))
                    country = info.get('country', 'Unknown')
                    city = info.get('city', 'Unknown')
                    
                    if is_real_user(org):
                        real_users.append({
                            'ip': ip,
                            'count': count,
                            'location': f"{country}, {city}",
                            'org': org
                        })
            
            # 정렬 (접속 횟수 내림차순)
            real_users.sort(key=lambda x: x['count'], reverse=True)
            
            # 테이블 출력
            if real_users:
                print(f"   Total Hits: {total_hits} | Real User IPs: {len(real_users)}")
                print(f"   {'Count':<6} | {'IP Address':<15} | {'Location':<30} | {'ISP/Org'}")
                print("   " + "-" * 80)
                for user in real_users:
                    # ISP 이름 너무 길면 자르기
                    org_name = user['org'][:35] + "..." if len(user['org']) > 35 else user['org']
                    print(f"   {user['count']:<6} | {user['ip']:<15} | {user['location']:<30} | {org_name}")
            else:
                print(f"   Total Hits: {total_hits} | No real users found (all bots).")

if __name__ == "__main__":
    main()
