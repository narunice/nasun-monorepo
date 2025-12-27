import axios from 'axios';
import logger from './logger';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // Ensure this is set in your .env file
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add the auth token to every request
api.interceptors.request.use(
  async (config) => {
    try {
      // TODO: Re-enable after Identity Pool is properly configured
      // const session = await fetchAuthSession();
      // const idToken = session.tokens?.idToken?.toString();

      // if (idToken) {
      //   config.headers.Authorization = `Bearer ${idToken}`;
      // }
      logger.debug('API request without auth token (temporarily disabled)');
    } catch (error) {
      // Error parameter is available but not used in this implementation
      void error;
      // This means the user is not authenticated. 
      // The request will proceed without an Authorization header.
      logger.log('User is not authenticated, or session fetch failed.');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle global errors, like 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // This indicates that the token is expired or invalid.
      // Redirecting to login is a good practice.
      logger.error('Unauthorized request. Redirecting to login.');
      // To prevent circular dependencies with router, we use window.location
      window.location.href = '/login?error=session_expired';
    }

    // It's important to return a Promise.reject here, so that the calling code's .catch() block will execute.
    return Promise.reject(error);
  }
);

export default api;
