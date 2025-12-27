"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({ region: process.env.AWS_REGION });
const handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }
    console.log('User Profile API called:', {
        httpMethod: event.httpMethod,
        queryParams: event.queryStringParameters,
        hasBody: !!event.body,
        path: event.path
    });
    try {
        const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';
        let identityId;
        if (event.httpMethod === 'GET') {
            // For GET requests, read identityId from query parameters
            const queryParams = event.queryStringParameters || {};
            identityId = queryParams.identityId;
            if (!identityId) {
                console.error('Missing identityId parameter in GET request');
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'identityId is required' }),
                };
            }
            // Get user profile
            const getCommand = new client_dynamodb_1.GetItemCommand({
                TableName: tableName,
                Key: {
                    identityId: { S: identityId }
                }
            });
            const result = await dynamoClient.send(getCommand);
            console.log('DynamoDB GET result:', result);
            if (result.Item) {
                // DynamoDB 아이템을 일반 객체로 변환 (linkedAccounts 제외)
                const baseProfile = {};
                for (const [key, value] of Object.entries(result.Item)) {
                    if (key === 'linkedAccounts' && value.M) {
                        // linkedAccounts는 Map 구조 그대로 변환
                        baseProfile.linkedAccounts = {};
                        for (const [provider, providerData] of Object.entries(value.M)) {
                            if (providerData.M) {
                                baseProfile.linkedAccounts[provider] = {};
                                for (const [field, fieldValue] of Object.entries(providerData.M)) {
                                    baseProfile.linkedAccounts[provider][field] = Object.values(fieldValue)[0];
                                }
                            }
                        }
                    }
                    else {
                        baseProfile[key] = Object.values(value)[0];
                    }
                }
                let unifiedProfile = { ...baseProfile };
                // linkedAccounts에 저장된 identityId로 추가 정보 조회 및 병합
                if (baseProfile.linkedAccounts) {
                    for (const provider in baseProfile.linkedAccounts) {
                        const linkedIdentityId = baseProfile.linkedAccounts[provider]?.identityId;
                        if (linkedIdentityId) {
                            const linkedProfileResult = await dynamoClient.send(new client_dynamodb_1.GetItemCommand({
                                TableName: tableName,
                                Key: { identityId: { S: linkedIdentityId } }
                            }));
                            if (linkedProfileResult.Item) {
                                const linkedProfile = Object.fromEntries(Object.entries(linkedProfileResult.Item)
                                    .filter(([key]) => key !== 'linkedAccounts')
                                    .map(([key, value]) => [key, Object.values(value)[0]]));
                                // 선택적 필드만 병합 (identityId, provider, createdAt, updatedAt, linkedAccounts는 덮어쓰지 않음)
                                const fieldsToMerge = ['email', 'twitterHandle', 'twitterId', 'profileImageUrl', 'username'];
                                fieldsToMerge.forEach(field => {
                                    if (linkedProfile[field] && !unifiedProfile[field]) {
                                        unifiedProfile[field] = linkedProfile[field];
                                    }
                                });
                            }
                        }
                    }
                }
                console.log('Returning unified user profile:', unifiedProfile);
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(unifiedProfile),
                };
            }
            else {
                console.log('User profile not found for identityId:', identityId);
                return {
                    statusCode: 404,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'User profile not found' }),
                };
            }
        }
        else if (event.httpMethod === 'POST') {
            // Create or update user profile
            let postData;
            // Handle both JSON and form-urlencoded data
            if (event.body) {
                try {
                    postData = JSON.parse(event.body);
                }
                catch (e) {
                    // If JSON parsing fails, assume it's form-urlencoded
                    const urlParams = new URLSearchParams(event.body);
                    postData = {
                        identityId: urlParams.get('identityId'),
                        provider: urlParams.get('provider'),
                        username: urlParams.get('username'),
                        email: urlParams.get('email'),
                        xHandle: urlParams.get('xHandle')
                    };
                }
            }
            else {
                const queryParams = event.queryStringParameters || {};
                postData = queryParams;
            }
            // Validate required fields for POST
            if (!postData.identityId) {
                console.error('Missing identityId in POST body');
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'identityId is required' }),
                };
            }
            if (!postData.provider || !postData.username) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'provider and username are required for creating profile' }),
                };
            }
            // Build Item with conditional fields
            const item = {
                identityId: { S: postData.identityId },
                username: { S: postData.username },
                provider: { S: postData.provider },
                createdAt: { S: new Date().toISOString() },
                updatedAt: { S: new Date().toISOString() }
            };
            // Add optional fields only if they exist
            if (postData.email)
                item.email = { S: postData.email };
            if (postData.xHandle)
                item.xHandle = { S: postData.xHandle };
            if (postData.twitterHandle)
                item.twitterHandle = { S: postData.twitterHandle };
            if (postData.twitterId)
                item.twitterId = { S: postData.twitterId };
            if (postData.profileImageUrl)
                item.profileImageUrl = { S: postData.profileImageUrl };
            const putCommand = new client_dynamodb_1.PutItemCommand({
                TableName: tableName,
                Item: item
            });
            await dynamoClient.send(putCommand);
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    message: 'User profile created/updated successfully',
                    success: true
                }),
            };
        }
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Method not allowed' }),
        };
    }
    catch (error) {
        console.error('Error handling user profile:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal server error', error: error.message }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEY7QUFFMUYsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUVyRSxNQUFNLE9BQU8sR0FBMkIsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO0lBQzdELE1BQU0sV0FBVyxHQUFHO1FBQ2xCLDZCQUE2QixFQUFFLEdBQUc7UUFDbEMsOEJBQThCLEVBQUUsNkJBQTZCO1FBQzdELDhCQUE4QixFQUFFLG9CQUFvQjtLQUNyRCxDQUFDO0lBRUYsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ25DLE9BQU8sRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQzdELENBQUM7SUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFO1FBQ3RDLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTtRQUM1QixXQUFXLEVBQUUsS0FBSyxDQUFDLHFCQUFxQjtRQUN4QyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJO1FBQ3JCLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtLQUNqQixDQUFDLENBQUM7SUFFSCxJQUFJLENBQUM7UUFDSCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixJQUFJLGNBQWMsQ0FBQztRQUNwRSxJQUFJLFVBQThCLENBQUM7UUFFbkMsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQy9CLDBEQUEwRDtZQUMxRCxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMscUJBQXFCLElBQUksRUFBRSxDQUFDO1lBQ3RELFVBQVUs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LElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztTQUNqRixDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQTFNVyxRQUFBLE9BQU8sV0EwTWxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5SGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQsIEdldEl0ZW1Db21tYW5kLCBQdXRJdGVtQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXI6IEFQSUdhdGV3YXlQcm94eUhhbmRsZXIgPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgY29uc3QgY29yc0hlYWRlcnMgPSB7XG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsIEF1dGhvcml6YXRpb24nLFxuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCwgUE9TVCwgT1BUSU9OUycsXG4gIH07XG5cbiAgaWYgKGV2ZW50Lmh0dHBNZXRob2QgPT09ICdPUFRJT05TJykge1xuICAgIHJldHVybiB7IHN0YXR1c0NvZGU6IDIwMCwgaGVhZGVyczogY29yc0hlYWRlcnMsIGJvZHk6ICcnIH07XG4gIH1cblxuICBjb25zb2xlLmxvZygnVXNlciBQcm9maWxlIEFQSSBjYWxsZWQ6Jywge1xuICAgIGh0dHBNZXRob2Q6IGV2ZW50Lmh0dHBNZXRob2QsXG4gICAgcXVlcnlQYXJhbXM6IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyxcbiAgICBoYXNCb2R5OiAhIWV2ZW50LmJvZHksXG4gICAgcGF0aDogZXZlbnQucGF0aFxuICB9KTtcblxuICB0cnkge1xuICAgIGNvbnN0IHRhYmxlTmFtZSA9IHByb2Nlc3MuZW52LlVTRVJfUFJPRklMRVNfVEFCTEUgfHwgJ1VzZXJQcm9maWxlcyc7XG4gICAgbGV0IGlkZW50aXR5SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgIGlmIChldmVudC5odHRwTWV0aG9kID09PSAnR0VUJykge1xuICAgICAgLy8gRm9yIEdFVCByZXF1ZXN0cywgcmVhZCBpZGVudGl0eUlkIGZyb20gcXVlcnkgcGFyYW1ldGVyc1xuICAgICAgY29uc3QgcXVlcnlQYXJhbXMgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMgfHwge307XG4gICAgICBpZGVudGl0eUlkID0gcXVlcnlQYXJhbXMuaWRlbnRpdHlJZDtcblxuICAgICAgaWYgKCFpZGVudGl0eUlkKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgaWRlbnRpdHlJZCBwYXJhbWV0ZXIgaW4gR0VUIHJlcXVlc3QnKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnaWRlbnRpdHlJZCBpcyByZXF1aXJlZCcgfSksXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIC8vIEdldCB1c2VyIHByb2ZpbGVcbiAgICAgIGNvbnN0IGdldENvbW1hbmQgPSBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgaWRlbnRpdHlJZDogeyBTOiBpZGVudGl0eUlkIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGR5bmFtb0NsaWVudC5zZW5kKGdldENvbW1hbmQpO1xuICAgICAgY29uc29sZS5sb2coJ0R5bmFtb0RCIEdFVCByZXN1bHQ6JywgcmVzdWx0KTtcbiAgICAgIFxuICAgICAgaWYgKHJlc3VsdC5JdGVtKSB7XG4gICAgICAgIC8vIER5bmFtb0RCIOyVhOydtO2FnOydhCDsnbzrsJgg6rCd7LK066GcIOuzgO2ZmCAobGlua2VkQWNjb3VudHMg7KCc7Jm4KVxuICAgICAgICBjb25zdCBiYXNlUHJvZmlsZTogYW55ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHJlc3VsdC5JdGVtKSkge1xuICAgICAgICAgIGlmIChrZXkgPT09ICdsaW5rZWRBY2NvdW50cycgJiYgdmFsdWUuTSkge1xuICAgICAgICAgICAgLy8gbGlua2VkQWNjb3VudHPripQgTWFwIOq1rOyhsCDqt7jrjIDroZwg67OA7ZmYXG4gICAgICAgICAgICBiYXNlUHJvZmlsZS5saW5rZWRBY2NvdW50cyA9IHt9O1xuICAgICAgICAgICAgZm9yIChjb25zdCBbcHJvdmlkZXIsIHByb3ZpZGVyRGF0YV0gb2YgT2JqZWN0LmVudHJpZXModmFsdWUuTSkpIHtcbiAgICAgICAgICAgICAgaWYgKHByb3ZpZGVyRGF0YS5NKSB7XG4gICAgICAgICAgICAgICAgYmFzZVByb2ZpbGUubGlua2VkQWNjb3VudHNbcHJvdmlkZXJdID0ge307XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBbZmllbGQsIGZpZWxkVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHByb3ZpZGVyRGF0YS5NKSkge1xuICAgICAgICAgICAgICAgICAgYmFzZVByb2ZpbGUubGlua2VkQWNjb3VudHNbcHJvdmlkZXJdW2ZpZWxkXSA9IE9iamVjdC52YWx1ZXMoZmllbGRWYWx1ZSlbMF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJhc2VQcm9maWxlW2tleV0gPSBPYmplY3QudmFsdWVzKHZhbHVlKVswXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdW5pZmllZFByb2ZpbGUgPSB7IC4uLmJhc2VQcm9maWxlIH07XG5cbiAgICAgICAgLy8gbGlua2VkQWNjb3VudHPsl5Ag7KCA7J6l65CcIGlkZW50aXR5SWTroZwg7LaU6rCAIOygleuztCDsobDtmowg67CPIOuzke2VqVxuICAgICAgICBpZiAoYmFzZVByb2ZpbGUubGlua2VkQWNjb3VudHMpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcHJvdmlkZXIgaW4gYmFzZVByb2ZpbGUubGlua2VkQWNjb3VudHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5rZWRJZGVudGl0eUlkID0gYmFzZVByb2ZpbGUubGlua2VkQWNjb3VudHNbcHJvdmlkZXJdPy5pZGVudGl0eUlkO1xuICAgICAgICAgICAgICAgIGlmIChsaW5rZWRJZGVudGl0eUlkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpbmtlZFByb2ZpbGVSZXN1bHQgPSBhd2FpdCBkeW5hbW9DbGllbnQuc2VuZChuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBLZXk6IHsgaWRlbnRpdHlJZDogeyBTOiBsaW5rZWRJZGVudGl0eUlkIH0gfVxuICAgICAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpbmtlZFByb2ZpbGVSZXN1bHQuSXRlbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGlua2VkUHJvZmlsZSA9IE9iamVjdC5mcm9tRW50cmllcyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmVudHJpZXMobGlua2VkUHJvZmlsZVJlc3VsdC5JdGVtKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoKFtrZXldKSA9PiBrZXkgIT09ICdsaW5rZWRBY2NvdW50cycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcCgoW2tleSwgdmFsdWVdKSA9PiBba2V5LCBPYmplY3QudmFsdWVzKHZhbHVlKVswXV0pXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDshKDtg53soIEg7ZWE65Oc66eMIOuzke2VqSAoaWRlbnRpdHlJZCwgcHJvdmlkZXIsIGNyZWF0ZWRBdCwgdXBkYXRlZEF0LCBsaW5rZWRBY2NvdW50c+uKlCDrja7slrTsk7Dsp4Ag7JWK7J2MKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGRzVG9NZXJnZSA9IFsnZW1haWwnLCAndHdpdHRlckhhbmRsZScsICd0d2l0dGVySWQnLCAncHJvZmlsZUltYWdlVXJsJywgJ3VzZXJuYW1lJ107XG4gICAgICAgICAgICAgICAgICAgICAgICBmaWVsZHNUb01lcmdlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobGlua2VkUHJvZmlsZVtmaWVsZF0gJiYgIXVuaWZpZWRQcm9maWxlW2ZpZWxkXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaWZpZWRQcm9maWxlW2ZpZWxkXSA9IGxpbmtlZFByb2ZpbGVbZmllbGRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUubG9nKCdSZXR1cm5pbmcgdW5pZmllZCB1c2VyIHByb2ZpbGU6JywgdW5pZmllZFByb2ZpbGUpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh1bmlmaWVkUHJvZmlsZSksXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZygnVXNlciBwcm9maWxlIG5vdCBmb3VuZCBmb3IgaWRlbnRpdHlJZDonLCBpZGVudGl0eUlkKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDQsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnVXNlciBwcm9maWxlIG5vdCBmb3VuZCcgfSksXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICB9IGVsc2UgaWYgKGV2ZW50Lmh0dHBNZXRob2QgPT09ICdQT1NUJykge1xuICAgICAgLy8gQ3JlYXRlIG9yIHVwZGF0ZSB1c2VyIHByb2ZpbGVcbiAgICAgIGxldCBwb3N0RGF0YTtcblxuICAgICAgLy8gSGFuZGxlIGJvdGggSlNPTiBhbmQgZm9ybS11cmxlbmNvZGVkIGRhdGFcbiAgICAgIGlmIChldmVudC5ib2R5KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcG9zdERhdGEgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gSWYgSlNPTiBwYXJzaW5nIGZhaWxzLCBhc3N1bWUgaXQncyBmb3JtLXVybGVuY29kZWRcbiAgICAgICAgICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGV2ZW50LmJvZHkpO1xuICAgICAgICAgIHBvc3REYXRhID0ge1xuICAgICAgICAgICAgaWRlbnRpdHlJZDogdXJsUGFyYW1zLmdldCgnaWRlbnRpdHlJZCcpLFxuICAgICAgICAgICAgcHJvdmlkZXI6IHVybFBhcmFtcy5nZXQoJ3Byb3ZpZGVyJyksXG4gICAgICAgICAgICB1c2VybmFtZTogdXJsUGFyYW1zLmdldCgndXNlcm5hbWUnKSxcbiAgICAgICAgICAgIGVtYWlsOiB1cmxQYXJhbXMuZ2V0KCdlbWFpbCcpLFxuICAgICAgICAgICAgeEhhbmRsZTogdXJsUGFyYW1zLmdldCgneEhhbmRsZScpXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcXVlcnlQYXJhbXMgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMgfHwge307XG4gICAgICAgIHBvc3REYXRhID0gcXVlcnlQYXJhbXM7XG4gICAgICB9XG5cbiAgICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIGZpZWxkcyBmb3IgUE9TVFxuICAgICAgaWYgKCFwb3N0RGF0YS5pZGVudGl0eUlkKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgaWRlbnRpdHlJZCBpbiBQT1NUIGJvZHknKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnaWRlbnRpdHlJZCBpcyByZXF1aXJlZCcgfSksXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIGlmICghcG9zdERhdGEucHJvdmlkZXIgfHwgIXBvc3REYXRhLnVzZXJuYW1lKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogJ3Byb3ZpZGVyIGFuZCB1c2VybmFtZSBhcmUgcmVxdWlyZWQgZm9yIGNyZWF0aW5nIHByb2ZpbGUnIH0pLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICAvLyBCdWlsZCBJdGVtIHdpdGggY29uZGl0aW9uYWwgZmllbGRzXG4gICAgICBjb25zdCBpdGVtOiBhbnkgPSB7XG4gICAgICAgIGlkZW50aXR5SWQ6IHsgUzogcG9zdERhdGEuaWRlbnRpdHlJZCB9LFxuICAgICAgICB1c2VybmFtZTogeyBTOiBwb3N0RGF0YS51c2VybmFtZSB9LFxuICAgICAgICBwcm92aWRlcjogeyBTOiBwb3N0RGF0YS5wcm92aWRlciB9LFxuICAgICAgICBjcmVhdGVkQXQ6IHsgUzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0sXG4gICAgICAgIHVwZGF0ZWRBdDogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIG9wdGlvbmFsIGZpZWxkcyBvbmx5IGlmIHRoZXkgZXhpc3RcbiAgICAgIGlmIChwb3N0RGF0YS5lbWFpbCkgaXRlbS5lbWFpbCA9IHsgUzogcG9zdERhdGEuZW1haWwgfTtcbiAgICAgIGlmIChwb3N0RGF0YS54SGFuZGxlKSBpdGVtLnhIYW5kbGUgPSB7IFM6IHBvc3REYXRhLnhIYW5kbGUgfTtcbiAgICAgIGlmIChwb3N0RGF0YS50d2l0dGVySGFuZGxlKSBpdGVtLnR3aXR0ZXJIYW5kbGUgPSB7IFM6IHBvc3REYXRhLnR3aXR0ZXJIYW5kbGUgfTtcbiAgICAgIGlmIChwb3N0RGF0YS50d2l0dGVySWQpIGl0ZW0udHdpdHRlcklkID0geyBTOiBwb3N0RGF0YS50d2l0dGVySWQgfTtcbiAgICAgIGlmIChwb3N0RGF0YS5wcm9maWxlSW1hZ2VVcmwpIGl0ZW0ucHJvZmlsZUltYWdlVXJsID0geyBTOiBwb3N0RGF0YS5wcm9maWxlSW1hZ2VVcmwgfTtcblxuICAgICAgY29uc3QgcHV0Q29tbWFuZCA9IG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBJdGVtOiBpdGVtXG4gICAgICB9KTtcblxuICAgICAgYXdhaXQgZHluYW1vQ2xpZW50LnNlbmQocHV0Q29tbWFuZCk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgXG4gICAgICAgICAgbWVzc2FnZTogJ1VzZXIgcHJvZmlsZSBjcmVhdGVkL3VwZGF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlIFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDQwNSxcbiAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnTWV0aG9kIG5vdCBhbGxvd2VkJyB9KSxcbiAgICB9O1xuXG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBoYW5kbGluZyB1c2VyIHByb2ZpbGU6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pLFxuICAgIH07XG4gIH1cbn07Il19