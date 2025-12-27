
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getEnvConfigV2 } from '../../utils/env';

const config = getEnvConfigV2();

const LEADERBOARD_DEFINITIONS = [
  { id: 'CUMULATIVE', name: 'All Time' },
  { id: 'EVENT1', name: 'Season 1' },
  { id: 'EVENT2', name: 'Season 2' },
  { id: 'EVENT3', name: 'Season 3' },
];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const visibleLeaderboardIds = config.visibleLeaderboards;

    const availableLeaderboards = LEADERBOARD_DEFINITIONS.map(lb => {
      const isVisible = visibleLeaderboardIds.includes(lb.id);
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (lb.id === 'EVENT1') {
        startDate = config.event1StartDate;
        endDate = config.event1EndDate;
      } else if (lb.id === 'EVENT2') {
        startDate = config.event2StartDate;
        endDate = config.event2EndDate;
      } else if (lb.id === 'EVENT3') {
        startDate = config.event3StartDate;
        endDate = config.event3EndDate;
      }

      return {
        id: lb.id,
        name: lb.name,
        startDate,
        endDate,
        active: isVisible,
        visible: isVisible,
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({
        success: true,
        data: {
          availableLeaderboards,
        },
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching leaderboard configuration:', errorMessage);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: errorMessage,
      }),
    };
  }
};
