"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;
// A simple response helper
const createResponse = (statusCode, body) => {
    return {
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify(body),
    };
};
const handler = async (event) => {
    if (!TABLE_NAME) {
        console.error("TABLE_NAME environment variable is not set.");
        return createResponse(500, { error: "Internal server error: Missing configuration." });
    }
    try {
        console.log("Scanning DynamoDB table:", TABLE_NAME);
        const scanCommand = new lib_dynamodb_1.ScanCommand({
            TableName: TABLE_NAME,
            // We only need the 'tier' attribute for counting
            ProjectionExpression: "tier",
        });
        const allItems = [];
        let lastEvaluatedKey;
        // Handle pagination in Scan
        do {
            const command = new lib_dynamodb_1.ScanCommand({
                TableName: TABLE_NAME,
                ProjectionExpression: "tier",
                ExclusiveStartKey: lastEvaluatedKey,
            });
            const response = await docClient.send(command);
            if (response.Items) {
                allItems.push(...response.Items);
            }
            lastEvaluatedKey = response.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        console.log(`Successfully scanned ${allItems.length} items.`);
        // Aggregate counts by tier
        const supplyCounts = {};
        for (const item of allItems) {
            if (item.tier) {
                supplyCounts[item.tier] = (supplyCounts[item.tier] || 0) + 1;
            }
        }
        console.log("Aggregated counts:", supplyCounts);
        return createResponse(200, {
            success: true,
            counts: supplyCounts,
        });
    }
    catch (error) {
        console.error("Error scanning DynamoDB:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return createResponse(500, { error: "Could not retrieve supply counts.", details: errorMessage });
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4REFBMEQ7QUFDMUQsd0RBQTRFO0FBRzVFLE1BQU0sTUFBTSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN0QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFdEQsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUM7QUFFMUMsMkJBQTJCO0FBQzNCLE1BQU0sY0FBYyxHQUFHLENBQUMsVUFBa0IsRUFBRSxJQUFZLEVBQUUsRUFBRTtJQUMxRCxPQUFPO1FBQ0wsVUFBVTtRQUNWLE9BQU8sRUFBRTtZQUNQLDZCQUE2QixFQUFFLEdBQUc7WUFDbEMsa0NBQWtDLEVBQUUsSUFBSTtTQUN6QztRQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQztLQUMzQixDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBRUssTUFBTSxPQUFPLEdBQTJCLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtJQUM3RCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDaEIsT0FBTyxDQUFDLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO1FBQzdELE9BQU8sY0FBYyxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSwrQ0FBK0MsRUFBRSxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUVELElBQUksQ0FBQztRQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFcEQsTUFBTSxXQUFXLEdBQUcsSUFBSSwwQkFBVyxDQUFDO1lBQ2xDLFNBQVMsRUFBRSxVQUFVO1lBQ3JCLGlEQUFpRDtZQUNqRCxvQkFBb0IsRUFBRSxNQUFNO1NBQzdCLENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLGdCQUFnQixDQUFDO1FBRXJCLDRCQUE0QjtRQUM1QixHQUFHLENBQUM7WUFDRixNQUFNLE9BQU8sR0FBRyxJQUFJLDBCQUFXLENBQUM7Z0JBQzlCLFNBQVMsRUFBRSxVQUFVO2dCQUNyQixvQkFBb0IsRUFBRSxNQUFNO2dCQUM1QixpQkFBaUIsRUFBRSxnQkFBZ0I7YUFDcEMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQy9DLElBQUksUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNuQixRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ25DLENBQUM7WUFDRCxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsZ0JBQWdCLENBQUM7UUFDL0MsQ0FBQyxRQUFRLGdCQUFnQixFQUFFO1FBRTNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLFFBQVEsQ0FBQyxNQUFNLFNBQVMsQ0FBQyxDQUFDO1FBRTlELDJCQUEyQjtRQUMzQixNQUFNLFlBQVksR0FBOEIsRUFBRSxDQUFDO1FBRW5ELEtBQUssTUFBTSxJQUFJLElBQUksUUFBUSxFQUFFLENBQUM7WUFDNUIsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2QsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQy9ELENBQUM7UUFDSCxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUVoRCxPQUFPLGNBQWMsQ0FBQyxHQUFHLEVBQUU7WUFDekIsT0FBTyxFQUFFLElBQUk7WUFDYixNQUFNLEVBQUUsWUFBWTtTQUNyQixDQUFDLENBQUM7SUFFTCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxZQUFZLEdBQUcsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDO1FBQzlFLE9BQU8sY0FBYyxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxtQ0FBbUMsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztJQUNwRyxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBdkRXLFFBQUEsT0FBTyxXQXVEbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFNjYW5Db21tYW5kIH0gZnJvbSBcIkBhd3Mtc2RrL2xpYi1keW5hbW9kYlwiO1xuaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5SGFuZGxlciB9IGZyb20gXCJhd3MtbGFtYmRhXCI7XG5cbmNvbnN0IGNsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcblxuY29uc3QgVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlRBQkxFX05BTUU7XG5cbi8vIEEgc2ltcGxlIHJlc3BvbnNlIGhlbHBlclxuY29uc3QgY3JlYXRlUmVzcG9uc2UgPSAoc3RhdHVzQ29kZTogbnVtYmVyLCBib2R5OiBvYmplY3QpID0+IHtcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgIFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXCI6IFwiKlwiLFxuICAgICAgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFsc1wiOiB0cnVlLFxuICAgIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoYm9keSksXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlcjogQVBJR2F0ZXdheVByb3h5SGFuZGxlciA9IGFzeW5jIChldmVudCkgPT4ge1xuICBpZiAoIVRBQkxFX05BTUUpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiVEFCTEVfTkFNRSBlbnZpcm9ubWVudCB2YXJpYWJsZSBpcyBub3Qgc2V0LlwiKTtcbiAgICByZXR1cm4gY3JlYXRlUmVzcG9uc2UoNTAwLCB7IGVycm9yOiBcIkludGVybmFsIHNlcnZlciBlcnJvcjogTWlzc2luZyBjb25maWd1cmF0aW9uLlwiIH0pO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcIlNjYW5uaW5nIER5bmFtb0RCIHRhYmxlOlwiLCBUQUJMRV9OQU1FKTtcblxuICAgIGNvbnN0IHNjYW5Db21tYW5kID0gbmV3IFNjYW5Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogVEFCTEVfTkFNRSxcbiAgICAgIC8vIFdlIG9ubHkgbmVlZCB0aGUgJ3RpZXInIGF0dHJpYnV0ZSBmb3IgY291bnRpbmdcbiAgICAgIFByb2plY3Rpb25FeHByZXNzaW9uOiBcInRpZXJcIixcbiAgICB9KTtcblxuICAgIGNvbnN0IGFsbEl0ZW1zID0gW107XG4gICAgbGV0IGxhc3RFdmFsdWF0ZWRLZXk7XG5cbiAgICAvLyBIYW5kbGUgcGFnaW5hdGlvbiBpbiBTY2FuXG4gICAgZG8ge1xuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBTY2FuQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogVEFCTEVfTkFNRSxcbiAgICAgICAgUHJvamVjdGlvbkV4cHJlc3Npb246IFwidGllclwiLFxuICAgICAgICBFeGNsdXNpdmVTdGFydEtleTogbGFzdEV2YWx1YXRlZEtleSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChjb21tYW5kKTtcbiAgICAgIGlmIChyZXNwb25zZS5JdGVtcykge1xuICAgICAgICBhbGxJdGVtcy5wdXNoKC4uLnJlc3BvbnNlLkl0ZW1zKTtcbiAgICAgIH1cbiAgICAgIGxhc3RFdmFsdWF0ZWRLZXkgPSByZXNwb25zZS5MYXN0RXZhbHVhdGVkS2V5O1xuICAgIH0gd2hpbGUgKGxhc3RFdmFsdWF0ZWRLZXkpO1xuXG4gICAgY29uc29sZS5sb2coYFN1Y2Nlc3NmdWxseSBzY2FubmVkICR7YWxsSXRlbXMubGVuZ3RofSBpdGVtcy5gKTtcblxuICAgIC8vIEFnZ3JlZ2F0ZSBjb3VudHMgYnkgdGllclxuICAgIGNvbnN0IHN1cHBseUNvdW50czogeyBba2V5OiBzdHJpbmddOiBudW1iZXIgfSA9IHt9O1xuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGFsbEl0ZW1zKSB7XG4gICAgICBpZiAoaXRlbS50aWVyKSB7XG4gICAgICAgIHN1cHBseUNvdW50c1tpdGVtLnRpZXJdID0gKHN1cHBseUNvdW50c1tpdGVtLnRpZXJdIHx8IDApICsgMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhcIkFnZ3JlZ2F0ZWQgY291bnRzOlwiLCBzdXBwbHlDb3VudHMpO1xuXG4gICAgcmV0dXJuIGNyZWF0ZVJlc3BvbnNlKDIwMCwge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIGNvdW50czogc3VwcGx5Q291bnRzLFxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkVycm9yIHNjYW5uaW5nIER5bmFtb0RCOlwiLCBlcnJvcik7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlVua25vd24gZXJyb3JcIjtcbiAgICByZXR1cm4gY3JlYXRlUmVzcG9uc2UoNTAwLCB7IGVycm9yOiBcIkNvdWxkIG5vdCByZXRyaWV2ZSBzdXBwbHkgY291bnRzLlwiLCBkZXRhaWxzOiBlcnJvck1lc3NhZ2UgfSk7XG4gIH1cbn07XG4iXX0=