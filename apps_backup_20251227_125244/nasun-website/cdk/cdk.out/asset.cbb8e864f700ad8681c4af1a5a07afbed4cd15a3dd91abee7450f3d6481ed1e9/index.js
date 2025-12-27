"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../node_modules/twitter-api-v2/dist/cjs/globals.js
var require_globals = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/globals.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.API_ADS_SANDBOX_PREFIX = exports2.API_ADS_PREFIX = exports2.API_V1_1_STREAM_PREFIX = exports2.API_V1_1_UPLOAD_PREFIX = exports2.API_V1_1_PREFIX = exports2.API_V2_LABS_PREFIX = exports2.API_V2_PREFIX = void 0;
    exports2.API_V2_PREFIX = "https://api.x.com/2/";
    exports2.API_V2_LABS_PREFIX = "https://api.x.com/labs/2/";
    exports2.API_V1_1_PREFIX = "https://api.x.com/1.1/";
    exports2.API_V1_1_UPLOAD_PREFIX = "https://upload.x.com/1.1/";
    exports2.API_V1_1_STREAM_PREFIX = "https://stream.x.com/1.1/";
    exports2.API_ADS_PREFIX = "https://ads-api.x.com/12/";
    exports2.API_ADS_SANDBOX_PREFIX = "https://ads-api-sandbox.twitter.com/12/";
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/TwitterPaginator.js
var require_TwitterPaginator = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/TwitterPaginator.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PreviousableTwitterPaginator = exports2.TwitterPaginator = void 0;
    var TwitterPaginator = class {
      // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
      constructor({ realData, rateLimit, instance, queryParams, sharedParams }) {
        this._maxResultsWhenFetchLast = 100;
        this._realData = realData;
        this._rateLimit = rateLimit;
        this._instance = instance;
        this._queryParams = queryParams;
        this._sharedParams = sharedParams;
      }
      get _isRateLimitOk() {
        if (!this._rateLimit) {
          return true;
        }
        const resetDate = this._rateLimit.reset * 1e3;
        if (resetDate < Date.now()) {
          return true;
        }
        return this._rateLimit.remaining > 0;
      }
      makeRequest(queryParams) {
        return this._instance.get(this.getEndpoint(), queryParams, { fullResponse: true, params: this._sharedParams });
      }
      makeNewInstanceFromResult(result, queryParams) {
        return new this.constructor({
          realData: result.data,
          rateLimit: result.rateLimit,
          instance: this._instance,
          queryParams,
          sharedParams: this._sharedParams
        });
      }
      getEndpoint() {
        return this._endpoint;
      }
      injectQueryParams(maxResults) {
        return {
          ...maxResults ? { max_results: maxResults } : {},
          ...this._queryParams
        };
      }
      /* ---------------------- */
      /* Real paginator methods */
      /* ---------------------- */
      /**
       * Next page.
       */
      async next(maxResults) {
        const queryParams = this.getNextQueryParams(maxResults);
        const result = await this.makeRequest(queryParams);
        return this.makeNewInstanceFromResult(result, queryParams);
      }
      /**
       * Next page, but store it in current instance.
       */
      async fetchNext(maxResults) {
        const queryParams = this.getNextQueryParams(maxResults);
        const result = await this.makeRequest(queryParams);
        await this.refreshInstanceFromResult(result, true);
        return this;
      }
      /**
       * Fetch up to {count} items after current page,
       * as long as rate limit is not hit and Twitter has some results
       */
      async fetchLast(count = Infinity) {
        let queryParams = this.getNextQueryParams(this._maxResultsWhenFetchLast);
        let resultCount = 0;
        while (resultCount < count && this._isRateLimitOk) {
          const response = await this.makeRequest(queryParams);
          await this.refreshInstanceFromResult(response, true);
          resultCount += this.getPageLengthFromRequest(response);
          if (this.isFetchLastOver(response)) {
            break;
          }
          queryParams = this.getNextQueryParams(this._maxResultsWhenFetchLast);
        }
        return this;
      }
      get rateLimit() {
        var _a;
        return { ...(_a = this._rateLimit) !== null && _a !== void 0 ? _a : {} };
      }
      /** Get raw data returned by Twitter API. */
      get data() {
        return this._realData;
      }
      get done() {
        return !this.canFetchNextPage(this._realData);
      }
      /**
       * Iterate over currently fetched items.
       */
      *[Symbol.iterator]() {
        yield* this.getItemArray();
      }
      /**
       * Iterate over items "indefinitely" (until rate limit is hit / they're no more items available)
       * This will **mutate the current instance** and fill data, metas, etc. inside this instance.
       *
       * If you need to handle concurrent requests, or you need to rely on immutability, please use `.fetchAndIterate()` instead.
       */
      async *[Symbol.asyncIterator]() {
        yield* this.getItemArray();
        let paginator = this;
        let canFetchNextPage = this.canFetchNextPage(this._realData);
        while (canFetchNextPage && this._isRateLimitOk && paginator.getItemArray().length > 0) {
          const next = await paginator.next(this._maxResultsWhenFetchLast);
          this.refreshInstanceFromResult({ data: next._realData, headers: {}, rateLimit: next._rateLimit }, true);
          canFetchNextPage = this.canFetchNextPage(next._realData);
          const items = next.getItemArray();
          yield* items;
          paginator = next;
        }
      }
      /**
       * Iterate over items "indefinitely" without modifying the current instance (until rate limit is hit / they're no more items available)
       *
       * This will **NOT** mutate the current instance, meaning that current instance will not inherit from `includes` and `meta` (v2 API only).
       * Use `Symbol.asyncIterator` (`for-await of`) to directly access items with current instance mutation.
       */
      async *fetchAndIterate() {
        for (const item of this.getItemArray()) {
          yield [item, this];
        }
        let paginator = this;
        let canFetchNextPage = this.canFetchNextPage(this._realData);
        while (canFetchNextPage && this._isRateLimitOk && paginator.getItemArray().length > 0) {
          const next = await paginator.next(this._maxResultsWhenFetchLast);
          this.refreshInstanceFromResult({ data: next._realData, headers: {}, rateLimit: next._rateLimit }, true);
          canFetchNextPage = this.canFetchNextPage(next._realData);
          for (const item of next.getItemArray()) {
            yield [item, next];
          }
          this._rateLimit = next._rateLimit;
          paginator = next;
        }
      }
    };
    exports2.TwitterPaginator = TwitterPaginator;
    var PreviousableTwitterPaginator = class extends TwitterPaginator {
      /**
       * Previous page (new tweets)
       */
      async previous(maxResults) {
        const queryParams = this.getPreviousQueryParams(maxResults);
        const result = await this.makeRequest(queryParams);
        return this.makeNewInstanceFromResult(result, queryParams);
      }
      /**
       * Previous page, but in current instance.
       */
      async fetchPrevious(maxResults) {
        const queryParams = this.getPreviousQueryParams(maxResults);
        const result = await this.makeRequest(queryParams);
        await this.refreshInstanceFromResult(result, false);
        return this;
      }
    };
    exports2.PreviousableTwitterPaginator = PreviousableTwitterPaginator;
    exports2.default = TwitterPaginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/paginator.v1.js
var require_paginator_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/paginator.v1.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CursoredV1Paginator = void 0;
    var TwitterPaginator_1 = __importDefault(require_TwitterPaginator());
    var CursoredV1Paginator = class extends TwitterPaginator_1.default {
      getNextQueryParams(maxResults) {
        var _a;
        return {
          ...this._queryParams,
          cursor: (_a = this._realData.next_cursor_str) !== null && _a !== void 0 ? _a : this._realData.next_cursor,
          ...maxResults ? { count: maxResults } : {}
        };
      }
      isFetchLastOver(result) {
        return !this.canFetchNextPage(result.data);
      }
      canFetchNextPage(result) {
        return !this.isNextCursorInvalid(result.next_cursor) || !this.isNextCursorInvalid(result.next_cursor_str);
      }
      isNextCursorInvalid(value) {
        return value === void 0 || value === 0 || value === -1 || value === "0" || value === "-1";
      }
    };
    exports2.CursoredV1Paginator = CursoredV1Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/dm.paginator.v1.js
var require_dm_paginator_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/dm.paginator.v1.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WelcomeDmV1Paginator = exports2.DmEventsV1Paginator = void 0;
    var paginator_v1_1 = require_paginator_v1();
    var DmEventsV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "direct_messages/events/list.json";
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.events.push(...result.events);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.events.length;
      }
      getItemArray() {
        return this.events;
      }
      /**
       * Events returned by paginator.
       */
      get events() {
        return this._realData.events;
      }
    };
    exports2.DmEventsV1Paginator = DmEventsV1Paginator;
    var WelcomeDmV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "direct_messages/welcome_messages/list.json";
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.welcome_messages.push(...result.welcome_messages);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.welcome_messages.length;
      }
      getItemArray() {
        return this.welcomeMessages;
      }
      get welcomeMessages() {
        return this._realData.welcome_messages;
      }
    };
    exports2.WelcomeDmV1Paginator = WelcomeDmV1Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/streaming.v1.types.js
var require_streaming_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/streaming.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/tweet.v1.types.js
var require_tweet_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/tweet.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EUploadMimeType = void 0;
    var EUploadMimeType;
    (function(EUploadMimeType2) {
      EUploadMimeType2["Jpeg"] = "image/jpeg";
      EUploadMimeType2["Mp4"] = "video/mp4";
      EUploadMimeType2["Mov"] = "video/quicktime";
      EUploadMimeType2["Gif"] = "image/gif";
      EUploadMimeType2["Png"] = "image/png";
      EUploadMimeType2["Srt"] = "text/plain";
      EUploadMimeType2["Webp"] = "image/webp";
    })(EUploadMimeType = exports2.EUploadMimeType || (exports2.EUploadMimeType = {}));
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/entities.v1.types.js
var require_entities_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/entities.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/user.v1.types.js
var require_user_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/user.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/dev-utilities.v1.types.js
var require_dev_utilities_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/dev-utilities.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/geo.v1.types.js
var require_geo_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/geo.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/trends.v1.types.js
var require_trends_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/trends.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/dm.v1.types.js
var require_dm_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/dm.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EDirectMessageEventTypeV1 = void 0;
    var EDirectMessageEventTypeV1;
    (function(EDirectMessageEventTypeV12) {
      EDirectMessageEventTypeV12["Create"] = "message_create";
      EDirectMessageEventTypeV12["WelcomeCreate"] = "welcome_message";
    })(EDirectMessageEventTypeV1 = exports2.EDirectMessageEventTypeV1 || (exports2.EDirectMessageEventTypeV1 = {}));
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/list.v1.types.js
var require_list_v1_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/list.v1.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v1/index.js
var require_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v1/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_streaming_v1_types(), exports2);
    __exportStar(require_tweet_v1_types(), exports2);
    __exportStar(require_entities_v1_types(), exports2);
    __exportStar(require_user_v1_types(), exports2);
    __exportStar(require_dev_utilities_v1_types(), exports2);
    __exportStar(require_geo_v1_types(), exports2);
    __exportStar(require_trends_v1_types(), exports2);
    __exportStar(require_dm_v1_types(), exports2);
    __exportStar(require_list_v1_types(), exports2);
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v2/streaming.v2.types.js
var require_streaming_v2_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v2/streaming.v2.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v2/tweet.v2.types.js
var require_tweet_v2_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v2/tweet.v2.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v2/tweet.definition.v2.js
var require_tweet_definition_v2 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v2/tweet.definition.v2.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v2/user.v2.types.js
var require_user_v2_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v2/user.v2.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v2/spaces.v2.types.js
var require_spaces_v2_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v2/spaces.v2.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v2/list.v2.types.js
var require_list_v2_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v2/list.v2.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v2/community.v2.types.js
var require_community_v2_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v2/community.v2.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/v2/index.js
var require_v2 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/v2/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_streaming_v2_types(), exports2);
    __exportStar(require_tweet_v2_types(), exports2);
    __exportStar(require_tweet_definition_v2(), exports2);
    __exportStar(require_user_v2_types(), exports2);
    __exportStar(require_spaces_v2_types(), exports2);
    __exportStar(require_list_v2_types(), exports2);
    __exportStar(require_community_v2_types(), exports2);
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/errors.types.js
var require_errors_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/errors.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EApiV2ErrorCode = exports2.EApiV1ErrorCode = exports2.ApiResponseError = exports2.ApiPartialResponseError = exports2.ApiRequestError = exports2.ETwitterApiError = void 0;
    var ETwitterApiError;
    (function(ETwitterApiError2) {
      ETwitterApiError2["Request"] = "request";
      ETwitterApiError2["PartialResponse"] = "partial-response";
      ETwitterApiError2["Response"] = "response";
    })(ETwitterApiError = exports2.ETwitterApiError || (exports2.ETwitterApiError = {}));
    var ApiError = class extends Error {
      constructor() {
        super(...arguments);
        this.error = true;
      }
    };
    var ApiRequestError = class extends ApiError {
      constructor(message, options) {
        super(message);
        this.type = ETwitterApiError.Request;
        Error.captureStackTrace(this, this.constructor);
        Object.defineProperty(this, "_options", { value: options });
      }
      get request() {
        return this._options.request;
      }
      get requestError() {
        return this._options.requestError;
      }
      toJSON() {
        return {
          type: this.type,
          error: this.requestError
        };
      }
    };
    exports2.ApiRequestError = ApiRequestError;
    var ApiPartialResponseError = class extends ApiError {
      constructor(message, options) {
        super(message);
        this.type = ETwitterApiError.PartialResponse;
        Error.captureStackTrace(this, this.constructor);
        Object.defineProperty(this, "_options", { value: options });
      }
      get request() {
        return this._options.request;
      }
      get response() {
        return this._options.response;
      }
      get responseError() {
        return this._options.responseError;
      }
      get rawContent() {
        return this._options.rawContent;
      }
      toJSON() {
        return {
          type: this.type,
          error: this.responseError
        };
      }
    };
    exports2.ApiPartialResponseError = ApiPartialResponseError;
    var ApiResponseError = class extends ApiError {
      constructor(message, options) {
        super(message);
        this.type = ETwitterApiError.Response;
        Error.captureStackTrace(this, this.constructor);
        Object.defineProperty(this, "_options", { value: options });
        this.code = options.code;
        this.headers = options.headers;
        this.rateLimit = options.rateLimit;
        if (options.data && typeof options.data === "object" && "error" in options.data && !options.data.errors) {
          const data = { ...options.data };
          data.errors = [{
            code: EApiV1ErrorCode.InternalError,
            message: data.error
          }];
          this.data = data;
        } else {
          this.data = options.data;
        }
      }
      get request() {
        return this._options.request;
      }
      get response() {
        return this._options.response;
      }
      /** Check for presence of one of given v1/v2 error codes. */
      hasErrorCode(...codes) {
        const errors = this.errors;
        if (!(errors === null || errors === void 0 ? void 0 : errors.length)) {
          return false;
        }
        if ("code" in errors[0]) {
          const v1errors = errors;
          return v1errors.some((error) => codes.includes(error.code));
        }
        const v2error = this.data;
        return codes.includes(v2error.type);
      }
      get errors() {
        var _a;
        return (_a = this.data) === null || _a === void 0 ? void 0 : _a.errors;
      }
      get rateLimitError() {
        return this.code === 420 || this.code === 429;
      }
      get isAuthError() {
        if (this.code === 401) {
          return true;
        }
        return this.hasErrorCode(EApiV1ErrorCode.AuthTimestampInvalid, EApiV1ErrorCode.AuthenticationFail, EApiV1ErrorCode.BadAuthenticationData, EApiV1ErrorCode.InvalidOrExpiredToken);
      }
      toJSON() {
        return {
          type: this.type,
          code: this.code,
          error: this.data,
          rateLimit: this.rateLimit,
          headers: this.headers
        };
      }
    };
    exports2.ApiResponseError = ApiResponseError;
    var EApiV1ErrorCode;
    (function(EApiV1ErrorCode2) {
      EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidCoordinates"] = 3] = "InvalidCoordinates";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NoLocationFound"] = 13] = "NoLocationFound";
      EApiV1ErrorCode2[EApiV1ErrorCode2["AuthenticationFail"] = 32] = "AuthenticationFail";
      EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidOrExpiredToken"] = 89] = "InvalidOrExpiredToken";
      EApiV1ErrorCode2[EApiV1ErrorCode2["UnableToVerifyCredentials"] = 99] = "UnableToVerifyCredentials";
      EApiV1ErrorCode2[EApiV1ErrorCode2["AuthTimestampInvalid"] = 135] = "AuthTimestampInvalid";
      EApiV1ErrorCode2[EApiV1ErrorCode2["BadAuthenticationData"] = 215] = "BadAuthenticationData";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NoUserMatch"] = 17] = "NoUserMatch";
      EApiV1ErrorCode2[EApiV1ErrorCode2["UserNotFound"] = 50] = "UserNotFound";
      EApiV1ErrorCode2[EApiV1ErrorCode2["ResourceNotFound"] = 34] = "ResourceNotFound";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetNotFound"] = 144] = "TweetNotFound";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetNotVisible"] = 179] = "TweetNotVisible";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NotAllowedResource"] = 220] = "NotAllowedResource";
      EApiV1ErrorCode2[EApiV1ErrorCode2["MediaIdNotFound"] = 325] = "MediaIdNotFound";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetNoLongerAvailable"] = 421] = "TweetNoLongerAvailable";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetViolatedRules"] = 422] = "TweetViolatedRules";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TargetUserSuspended"] = 63] = "TargetUserSuspended";
      EApiV1ErrorCode2[EApiV1ErrorCode2["YouAreSuspended"] = 64] = "YouAreSuspended";
      EApiV1ErrorCode2[EApiV1ErrorCode2["AccountUpdateFailed"] = 120] = "AccountUpdateFailed";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NoSelfSpamReport"] = 36] = "NoSelfSpamReport";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NoSelfMute"] = 271] = "NoSelfMute";
      EApiV1ErrorCode2[EApiV1ErrorCode2["AccountLocked"] = 326] = "AccountLocked";
      EApiV1ErrorCode2[EApiV1ErrorCode2["RateLimitExceeded"] = 88] = "RateLimitExceeded";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NoDMRightForApp"] = 93] = "NoDMRightForApp";
      EApiV1ErrorCode2[EApiV1ErrorCode2["OverCapacity"] = 130] = "OverCapacity";
      EApiV1ErrorCode2[EApiV1ErrorCode2["InternalError"] = 131] = "InternalError";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TooManyFollowings"] = 161] = "TooManyFollowings";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetLimitExceeded"] = 185] = "TweetLimitExceeded";
      EApiV1ErrorCode2[EApiV1ErrorCode2["DuplicatedTweet"] = 187] = "DuplicatedTweet";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TooManySpamReports"] = 205] = "TooManySpamReports";
      EApiV1ErrorCode2[EApiV1ErrorCode2["RequestLooksLikeSpam"] = 226] = "RequestLooksLikeSpam";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NoWriteRightForApp"] = 261] = "NoWriteRightForApp";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetActionsDisabled"] = 425] = "TweetActionsDisabled";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetRepliesRestricted"] = 433] = "TweetRepliesRestricted";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NamedParameterMissing"] = 38] = "NamedParameterMissing";
      EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidAttachmentUrl"] = 44] = "InvalidAttachmentUrl";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetTextTooLong"] = 186] = "TweetTextTooLong";
      EApiV1ErrorCode2[EApiV1ErrorCode2["MissingUrlParameter"] = 195] = "MissingUrlParameter";
      EApiV1ErrorCode2[EApiV1ErrorCode2["NoMultipleGifs"] = 323] = "NoMultipleGifs";
      EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidMediaIds"] = 324] = "InvalidMediaIds";
      EApiV1ErrorCode2[EApiV1ErrorCode2["InvalidUrl"] = 407] = "InvalidUrl";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TooManyTweetAttachments"] = 386] = "TooManyTweetAttachments";
      EApiV1ErrorCode2[EApiV1ErrorCode2["StatusAlreadyFavorited"] = 139] = "StatusAlreadyFavorited";
      EApiV1ErrorCode2[EApiV1ErrorCode2["FollowRequestAlreadySent"] = 160] = "FollowRequestAlreadySent";
      EApiV1ErrorCode2[EApiV1ErrorCode2["CannotUnmuteANonMutedAccount"] = 272] = "CannotUnmuteANonMutedAccount";
      EApiV1ErrorCode2[EApiV1ErrorCode2["TweetAlreadyRetweeted"] = 327] = "TweetAlreadyRetweeted";
      EApiV1ErrorCode2[EApiV1ErrorCode2["ReplyToDeletedTweet"] = 385] = "ReplyToDeletedTweet";
      EApiV1ErrorCode2[EApiV1ErrorCode2["DMReceiverNotFollowingYou"] = 150] = "DMReceiverNotFollowingYou";
      EApiV1ErrorCode2[EApiV1ErrorCode2["UnableToSendDM"] = 151] = "UnableToSendDM";
      EApiV1ErrorCode2[EApiV1ErrorCode2["MustAllowDMFromAnyone"] = 214] = "MustAllowDMFromAnyone";
      EApiV1ErrorCode2[EApiV1ErrorCode2["CannotSendDMToThisUser"] = 349] = "CannotSendDMToThisUser";
      EApiV1ErrorCode2[EApiV1ErrorCode2["DMTextTooLong"] = 354] = "DMTextTooLong";
      EApiV1ErrorCode2[EApiV1ErrorCode2["SubscriptionAlreadyExists"] = 355] = "SubscriptionAlreadyExists";
      EApiV1ErrorCode2[EApiV1ErrorCode2["CallbackUrlNotApproved"] = 415] = "CallbackUrlNotApproved";
      EApiV1ErrorCode2[EApiV1ErrorCode2["SuspendedApplication"] = 416] = "SuspendedApplication";
      EApiV1ErrorCode2[EApiV1ErrorCode2["OobOauthIsNotAllowed"] = 417] = "OobOauthIsNotAllowed";
    })(EApiV1ErrorCode = exports2.EApiV1ErrorCode || (exports2.EApiV1ErrorCode = {}));
    var EApiV2ErrorCode;
    (function(EApiV2ErrorCode2) {
      EApiV2ErrorCode2["InvalidRequest"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#invalid-request";
      EApiV2ErrorCode2["ClientForbidden"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#client-forbidden";
      EApiV2ErrorCode2["UnsupportedAuthentication"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#unsupported-authentication";
      EApiV2ErrorCode2["InvalidRules"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#invalid-rules";
      EApiV2ErrorCode2["TooManyRules"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#rule-cap";
      EApiV2ErrorCode2["DuplicatedRules"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#duplicate-rules";
      EApiV2ErrorCode2["RateLimitExceeded"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#usage-capped";
      EApiV2ErrorCode2["ConnectionError"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#streaming-connection";
      EApiV2ErrorCode2["ClientDisconnected"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#client-disconnected";
      EApiV2ErrorCode2["TwitterDisconnectedYou"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#operational-disconnect";
      EApiV2ErrorCode2["ResourceNotFound"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#resource-not-found";
      EApiV2ErrorCode2["ResourceUnauthorized"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#not-authorized-for-resource";
      EApiV2ErrorCode2["DisallowedResource"] = "https://developer.x.com/en/support/x-api/error-troubleshooting#disallowed-resource";
    })(EApiV2ErrorCode = exports2.EApiV2ErrorCode || (exports2.EApiV2ErrorCode = {}));
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/responses.types.js
var require_responses_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/responses.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/client.types.js
var require_client_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/client.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ETwitterStreamEvent = void 0;
    var ETwitterStreamEvent;
    (function(ETwitterStreamEvent2) {
      ETwitterStreamEvent2["Connected"] = "connected";
      ETwitterStreamEvent2["ConnectError"] = "connect error";
      ETwitterStreamEvent2["ConnectionError"] = "connection error";
      ETwitterStreamEvent2["ConnectionClosed"] = "connection closed";
      ETwitterStreamEvent2["ConnectionLost"] = "connection lost";
      ETwitterStreamEvent2["ReconnectAttempt"] = "reconnect attempt";
      ETwitterStreamEvent2["Reconnected"] = "reconnected";
      ETwitterStreamEvent2["ReconnectError"] = "reconnect error";
      ETwitterStreamEvent2["ReconnectLimitExceeded"] = "reconnect limit exceeded";
      ETwitterStreamEvent2["DataKeepAlive"] = "data keep-alive";
      ETwitterStreamEvent2["Data"] = "data event content";
      ETwitterStreamEvent2["DataError"] = "data twitter error";
      ETwitterStreamEvent2["TweetParseError"] = "data tweet parse error";
      ETwitterStreamEvent2["Error"] = "stream error";
    })(ETwitterStreamEvent = exports2.ETwitterStreamEvent || (exports2.ETwitterStreamEvent = {}));
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/auth.types.js
var require_auth_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/auth.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/plugins/client.plugins.types.js
var require_client_plugins_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/plugins/client.plugins.types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterApiPluginResponseOverride = void 0;
    var TwitterApiPluginResponseOverride = class {
      constructor(value) {
        this.value = value;
      }
    };
    exports2.TwitterApiPluginResponseOverride = TwitterApiPluginResponseOverride;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/plugins/index.js
var require_plugins = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/plugins/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_client_plugins_types(), exports2);
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/types/index.js
var require_types = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/types/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_v1(), exports2);
    __exportStar(require_v2(), exports2);
    __exportStar(require_errors_types(), exports2);
    __exportStar(require_responses_types(), exports2);
    __exportStar(require_client_types(), exports2);
    __exportStar(require_auth_types(), exports2);
    __exportStar(require_plugins(), exports2);
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/settings.js
var require_settings = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterApiV2Settings = void 0;
    exports2.TwitterApiV2Settings = {
      debug: false,
      deprecationWarnings: true,
      logger: { log: console.log.bind(console) }
    };
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/helpers.js
var require_helpers = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/helpers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.safeDeprecationWarning = exports2.hasMultipleItems = exports2.isTweetStreamV2ErrorPayload = exports2.trimUndefinedProperties = exports2.arrayWrap = exports2.sharedPromise = void 0;
    var settings_1 = require_settings();
    function sharedPromise(getter) {
      const sharedPromise2 = {
        value: void 0,
        promise: getter().then((val) => {
          sharedPromise2.value = val;
          return val;
        })
      };
      return sharedPromise2;
    }
    exports2.sharedPromise = sharedPromise;
    function arrayWrap(value) {
      if (Array.isArray(value)) {
        return value;
      }
      return [value];
    }
    exports2.arrayWrap = arrayWrap;
    function trimUndefinedProperties(object) {
      for (const parameter of Object.keys(object)) {
        if (object[parameter] === void 0) {
          delete object[parameter];
        }
      }
    }
    exports2.trimUndefinedProperties = trimUndefinedProperties;
    function isTweetStreamV2ErrorPayload(payload) {
      return typeof payload === "object" && "errors" in payload && !("data" in payload);
    }
    exports2.isTweetStreamV2ErrorPayload = isTweetStreamV2ErrorPayload;
    function hasMultipleItems(item) {
      if (Array.isArray(item) && item.length > 1) {
        return true;
      }
      return item.toString().includes(",");
    }
    exports2.hasMultipleItems = hasMultipleItems;
    var deprecationWarningsCache = /* @__PURE__ */ new Set();
    function safeDeprecationWarning(message) {
      if (typeof console === "undefined" || !console.warn || !settings_1.TwitterApiV2Settings.deprecationWarnings) {
        return;
      }
      const hash = `${message.instance}-${message.method}-${message.problem}`;
      if (deprecationWarningsCache.has(hash)) {
        return;
      }
      const formattedMsg = `[twitter-api-v2] Deprecation warning: In ${message.instance}.${message.method}() call, ${message.problem}.
${message.resolution}.`;
      console.warn(formattedMsg);
      console.warn("To disable this message, import variable TwitterApiV2Settings from twitter-api-v2 and set TwitterApiV2Settings.deprecationWarnings to false.");
      deprecationWarningsCache.add(hash);
    }
    exports2.safeDeprecationWarning = safeDeprecationWarning;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client-mixins/request-handler.helper.js
var require_request_handler_helper = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client-mixins/request-handler.helper.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.RequestHandlerHelper = void 0;
    var https_1 = require("https");
    var settings_1 = require_settings();
    var TweetStream_1 = __importDefault(require_TweetStream());
    var types_1 = require_types();
    var zlib = __importStar(require("zlib"));
    var events_1 = require("events");
    var RequestHandlerHelper = class {
      constructor(requestData) {
        this.requestData = requestData;
        this.requestErrorHandled = false;
        this.responseData = [];
      }
      /* Request helpers */
      get hrefPathname() {
        const url = this.requestData.url;
        return url.hostname + url.pathname;
      }
      isCompressionDisabled() {
        return !this.requestData.compression || this.requestData.compression === "identity";
      }
      isFormEncodedEndpoint() {
        return this.requestData.url.href.startsWith("https://api.x.com/oauth/");
      }
      /* Error helpers */
      createRequestError(error) {
        if (settings_1.TwitterApiV2Settings.debug) {
          settings_1.TwitterApiV2Settings.logger.log("Request error:", error);
        }
        return new types_1.ApiRequestError("Request failed.", {
          request: this.req,
          error
        });
      }
      createPartialResponseError(error, abortClose) {
        const res = this.res;
        let message = `Request failed with partial response with HTTP code ${res.statusCode}`;
        if (abortClose) {
          message += " (connection abruptly closed)";
        } else {
          message += " (parse error)";
        }
        return new types_1.ApiPartialResponseError(message, {
          request: this.req,
          response: this.res,
          responseError: error,
          rawContent: Buffer.concat(this.responseData).toString()
        });
      }
      formatV1Errors(errors) {
        return errors.map(({ code, message }) => `${message} (Twitter code ${code})`).join(", ");
      }
      formatV2Error(error) {
        return `${error.title}: ${error.detail} (see ${error.type})`;
      }
      createResponseError({ res, data, rateLimit, code }) {
        var _a;
        if (settings_1.TwitterApiV2Settings.debug) {
          settings_1.TwitterApiV2Settings.logger.log(`Request failed with code ${code}, data:`, data);
          settings_1.TwitterApiV2Settings.logger.log("Response headers:", res.headers);
        }
        let errorString = `Request failed with code ${code}`;
        if ((_a = data === null || data === void 0 ? void 0 : data.errors) === null || _a === void 0 ? void 0 : _a.length) {
          const errors = data.errors;
          if (typeof errors[0] === "object" && "code" in errors[0]) {
            errorString += " - " + this.formatV1Errors(errors);
          } else {
            errorString += " - " + this.formatV2Error(data);
          }
        }
        return new types_1.ApiResponseError(errorString, {
          code,
          data,
          headers: res.headers,
          request: this.req,
          response: res,
          rateLimit
        });
      }
      /* Response helpers */
      getResponseDataStream(res) {
        if (this.isCompressionDisabled()) {
          return res;
        }
        const contentEncoding = (res.headers["content-encoding"] || "identity").trim().toLowerCase();
        if (contentEncoding === "br") {
          const brotli = zlib.createBrotliDecompress({
            flush: zlib.constants.BROTLI_OPERATION_FLUSH,
            finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH
          });
          res.pipe(brotli);
          return brotli;
        }
        if (contentEncoding === "gzip") {
          const gunzip = zlib.createGunzip({
            flush: zlib.constants.Z_SYNC_FLUSH,
            finishFlush: zlib.constants.Z_SYNC_FLUSH
          });
          res.pipe(gunzip);
          return gunzip;
        }
        if (contentEncoding === "deflate") {
          const inflate = zlib.createInflate({
            flush: zlib.constants.Z_SYNC_FLUSH,
            finishFlush: zlib.constants.Z_SYNC_FLUSH
          });
          res.pipe(inflate);
          return inflate;
        }
        return res;
      }
      detectResponseType(res) {
        var _a, _b;
        if (((_a = res.headers["content-type"]) === null || _a === void 0 ? void 0 : _a.includes("application/json")) || ((_b = res.headers["content-type"]) === null || _b === void 0 ? void 0 : _b.includes("application/problem+json"))) {
          return "json";
        } else if (this.isFormEncodedEndpoint()) {
          return "url";
        }
        return "text";
      }
      getParsedResponse(res) {
        const data = this.responseData;
        const mode = this.requestData.forceParseMode || this.detectResponseType(res);
        if (mode === "buffer") {
          return Buffer.concat(data);
        } else if (mode === "text") {
          return Buffer.concat(data).toString();
        } else if (mode === "json") {
          const asText = Buffer.concat(data).toString();
          return asText.length ? JSON.parse(asText) : void 0;
        } else if (mode === "url") {
          const asText = Buffer.concat(data).toString();
          const formEntries = {};
          for (const [item, value] of new URLSearchParams(asText)) {
            formEntries[item] = value;
          }
          return formEntries;
        } else {
          return void 0;
        }
      }
      getRateLimitFromResponse(res) {
        let rateLimit = void 0;
        if (res.headers["x-rate-limit-limit"]) {
          rateLimit = {
            limit: Number(res.headers["x-rate-limit-limit"]),
            remaining: Number(res.headers["x-rate-limit-remaining"]),
            reset: Number(res.headers["x-rate-limit-reset"])
          };
          if (res.headers["x-app-limit-24hour-limit"]) {
            rateLimit.day = {
              limit: Number(res.headers["x-app-limit-24hour-limit"]),
              remaining: Number(res.headers["x-app-limit-24hour-remaining"]),
              reset: Number(res.headers["x-app-limit-24hour-reset"])
            };
          }
          if (res.headers["x-user-limit-24hour-limit"]) {
            rateLimit.userDay = {
              limit: Number(res.headers["x-user-limit-24hour-limit"]),
              remaining: Number(res.headers["x-user-limit-24hour-remaining"]),
              reset: Number(res.headers["x-user-limit-24hour-reset"])
            };
          }
          if (this.requestData.rateLimitSaver) {
            this.requestData.rateLimitSaver(rateLimit);
          }
        }
        return rateLimit;
      }
      /* Request event handlers */
      onSocketEventHandler(reject, cleanupListener, socket) {
        const onClose = this.onSocketCloseHandler.bind(this, reject);
        socket.on("close", onClose);
        cleanupListener.on("complete", () => socket.off("close", onClose));
      }
      onSocketCloseHandler(reject) {
        this.req.removeAllListeners("timeout");
        const res = this.res;
        if (res) {
          return;
        }
        if (!this.requestErrorHandled) {
          return reject(this.createRequestError(new Error("Socket closed without any information.")));
        }
      }
      requestErrorHandler(reject, requestError) {
        var _a, _b;
        (_b = (_a = this.requestData).requestEventDebugHandler) === null || _b === void 0 ? void 0 : _b.call(_a, "request-error", { requestError });
        this.requestErrorHandled = true;
        reject(this.createRequestError(requestError));
      }
      timeoutErrorHandler() {
        this.requestErrorHandled = true;
        this.req.destroy(new Error("Request timeout."));
      }
      /* Response event handlers */
      classicResponseHandler(resolve, reject, res) {
        this.res = res;
        const dataStream = this.getResponseDataStream(res);
        dataStream.on("data", (chunk) => this.responseData.push(chunk));
        dataStream.on("end", this.onResponseEndHandler.bind(this, resolve, reject));
        dataStream.on("close", this.onResponseCloseHandler.bind(this, resolve, reject));
        if (this.requestData.requestEventDebugHandler) {
          this.requestData.requestEventDebugHandler("response", { res });
          res.on("aborted", (error) => this.requestData.requestEventDebugHandler("response-aborted", { error }));
          res.on("error", (error) => this.requestData.requestEventDebugHandler("response-error", { error }));
          res.on("close", () => this.requestData.requestEventDebugHandler("response-close", { data: this.responseData }));
          res.on("end", () => this.requestData.requestEventDebugHandler("response-end"));
        }
      }
      onResponseEndHandler(resolve, reject) {
        const rateLimit = this.getRateLimitFromResponse(this.res);
        let data;
        try {
          data = this.getParsedResponse(this.res);
        } catch (e) {
          reject(this.createPartialResponseError(e, false));
          return;
        }
        const code = this.res.statusCode;
        if (code >= 400) {
          reject(this.createResponseError({ data, res: this.res, rateLimit, code }));
          return;
        }
        if (settings_1.TwitterApiV2Settings.debug) {
          settings_1.TwitterApiV2Settings.logger.log(`[${this.requestData.options.method} ${this.hrefPathname}]: Request succeeds with code ${this.res.statusCode}`);
          settings_1.TwitterApiV2Settings.logger.log("Response body:", data);
        }
        resolve({
          data,
          headers: this.res.headers,
          rateLimit
        });
      }
      onResponseCloseHandler(resolve, reject) {
        const res = this.res;
        if (res.aborted) {
          try {
            this.getParsedResponse(this.res);
            return this.onResponseEndHandler(resolve, reject);
          } catch (e) {
            return reject(this.createPartialResponseError(e, true));
          }
        }
        if (!res.complete) {
          return reject(this.createPartialResponseError(new Error("Response has been interrupted before response could be parsed."), true));
        }
      }
      streamResponseHandler(resolve, reject, res) {
        const code = res.statusCode;
        if (code < 400) {
          if (settings_1.TwitterApiV2Settings.debug) {
            settings_1.TwitterApiV2Settings.logger.log(`[${this.requestData.options.method} ${this.hrefPathname}]: Request succeeds with code ${res.statusCode} (starting stream)`);
          }
          const dataStream = this.getResponseDataStream(res);
          resolve({ req: this.req, res: dataStream, originalResponse: res, requestData: this.requestData });
        } else {
          this.classicResponseHandler(() => void 0, reject, res);
        }
      }
      /* Wrappers for request lifecycle */
      debugRequest() {
        const url = this.requestData.url;
        settings_1.TwitterApiV2Settings.logger.log(`[${this.requestData.options.method} ${this.hrefPathname}]`, this.requestData.options);
        if (url.search) {
          settings_1.TwitterApiV2Settings.logger.log("Request parameters:", [...url.searchParams.entries()].map(([key, value]) => `${key}: ${value}`));
        }
        if (this.requestData.body) {
          settings_1.TwitterApiV2Settings.logger.log("Request body:", this.requestData.body);
        }
      }
      buildRequest() {
        var _a;
        const url = this.requestData.url;
        const auth = url.username ? `${url.username}:${url.password}` : void 0;
        const headers = (_a = this.requestData.options.headers) !== null && _a !== void 0 ? _a : {};
        if (this.requestData.compression === true || this.requestData.compression === "brotli") {
          headers["accept-encoding"] = "br;q=1.0, gzip;q=0.8, deflate;q=0.5, *;q=0.1";
        } else if (this.requestData.compression === "gzip") {
          headers["accept-encoding"] = "gzip;q=1, deflate;q=0.5, *;q=0.1";
        } else if (this.requestData.compression === "deflate") {
          headers["accept-encoding"] = "deflate;q=1, *;q=0.1";
        }
        if (settings_1.TwitterApiV2Settings.debug) {
          this.debugRequest();
        }
        this.req = (0, https_1.request)({
          ...this.requestData.options,
          // Define URL params manually, addresses dependencies error https://github.com/PLhery/node-twitter-api-v2/issues/94
          host: url.hostname,
          port: url.port || void 0,
          path: url.pathname + url.search,
          protocol: url.protocol,
          auth,
          headers
        });
      }
      registerRequestEventDebugHandlers(req) {
        req.on("close", () => this.requestData.requestEventDebugHandler("close"));
        req.on("abort", () => this.requestData.requestEventDebugHandler("abort"));
        req.on("socket", (socket) => {
          this.requestData.requestEventDebugHandler("socket", { socket });
          socket.on("error", (error) => this.requestData.requestEventDebugHandler("socket-error", { socket, error }));
          socket.on("connect", () => this.requestData.requestEventDebugHandler("socket-connect", { socket }));
          socket.on("close", (withError) => this.requestData.requestEventDebugHandler("socket-close", { socket, withError }));
          socket.on("end", () => this.requestData.requestEventDebugHandler("socket-end", { socket }));
          socket.on("lookup", (...data) => this.requestData.requestEventDebugHandler("socket-lookup", { socket, data }));
          socket.on("timeout", () => this.requestData.requestEventDebugHandler("socket-timeout", { socket }));
        });
      }
      makeRequest() {
        this.buildRequest();
        return new Promise((_resolve, _reject) => {
          const resolve = (value) => {
            cleanupListener.emit("complete");
            _resolve(value);
          };
          const reject = (value) => {
            cleanupListener.emit("complete");
            _reject(value);
          };
          const cleanupListener = new events_1.EventEmitter();
          const req = this.req;
          req.on("error", this.requestErrorHandler.bind(this, reject));
          req.on("socket", this.onSocketEventHandler.bind(this, reject, cleanupListener));
          req.on("response", this.classicResponseHandler.bind(this, resolve, reject));
          if (this.requestData.options.timeout) {
            req.on("timeout", this.timeoutErrorHandler.bind(this));
          }
          if (this.requestData.requestEventDebugHandler) {
            this.registerRequestEventDebugHandlers(req);
          }
          if (this.requestData.body) {
            req.write(this.requestData.body);
          }
          req.end();
        });
      }
      async makeRequestAsStream() {
        const { req, res, requestData, originalResponse } = await this.makeRequestAndResolveWhenReady();
        return new TweetStream_1.default(requestData, { req, res, originalResponse });
      }
      makeRequestAndResolveWhenReady() {
        this.buildRequest();
        return new Promise((resolve, reject) => {
          const req = this.req;
          req.on("error", this.requestErrorHandler.bind(this, reject));
          req.on("response", this.streamResponseHandler.bind(this, resolve, reject));
          if (this.requestData.body) {
            req.write(this.requestData.body);
          }
          req.end();
        });
      }
    };
    exports2.RequestHandlerHelper = RequestHandlerHelper;
    exports2.default = RequestHandlerHelper;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/stream/TweetStreamEventCombiner.js
var require_TweetStreamEventCombiner = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/stream/TweetStreamEventCombiner.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TweetStreamEventCombiner = void 0;
    var events_1 = require("events");
    var types_1 = require_types();
    var TweetStreamEventCombiner = class extends events_1.EventEmitter {
      constructor(stream) {
        super();
        this.stream = stream;
        this.stack = [];
        this.onStreamData = this.onStreamData.bind(this);
        this.onStreamError = this.onStreamError.bind(this);
        this.onceNewEvent = this.once.bind(this, "event");
        stream.on(types_1.ETwitterStreamEvent.Data, this.onStreamData);
        stream.on(types_1.ETwitterStreamEvent.ConnectionError, this.onStreamError);
        stream.on(types_1.ETwitterStreamEvent.TweetParseError, this.onStreamError);
        stream.on(types_1.ETwitterStreamEvent.ConnectionClosed, this.onStreamError);
      }
      /** Returns a new `Promise` that will `resolve` on next event (`data` or any sort of error). */
      nextEvent() {
        return new Promise(this.onceNewEvent);
      }
      /** Returns `true` if there's something in the stack. */
      hasStack() {
        return this.stack.length > 0;
      }
      /** Returns stacked data events, and clean the stack. */
      popStack() {
        const stack = this.stack;
        this.stack = [];
        return stack;
      }
      /** Cleanup all the listeners attached on stream. */
      destroy() {
        this.removeAllListeners();
        this.stream.off(types_1.ETwitterStreamEvent.Data, this.onStreamData);
        this.stream.off(types_1.ETwitterStreamEvent.ConnectionError, this.onStreamError);
        this.stream.off(types_1.ETwitterStreamEvent.TweetParseError, this.onStreamError);
        this.stream.off(types_1.ETwitterStreamEvent.ConnectionClosed, this.onStreamError);
      }
      emitEvent(type, payload) {
        this.emit("event", { type, payload });
      }
      onStreamError(payload) {
        this.emitEvent("error", payload);
      }
      onStreamData(payload) {
        this.stack.push(payload);
        this.emitEvent("data", payload);
      }
    };
    exports2.TweetStreamEventCombiner = TweetStreamEventCombiner;
    exports2.default = TweetStreamEventCombiner;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/stream/TweetStreamParser.js
var require_TweetStreamParser = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/stream/TweetStreamParser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EStreamParserEvent = void 0;
    var events_1 = require("events");
    var TweetStreamParser = class extends events_1.EventEmitter {
      constructor() {
        super(...arguments);
        this.currentMessage = "";
      }
      // Code partially belongs to twitter-stream-api for this
      // https://github.com/trygve-lie/twitter-stream-api/blob/master/lib/parser.js
      push(chunk) {
        this.currentMessage += chunk;
        chunk = this.currentMessage;
        const size = chunk.length;
        let start = 0;
        let offset = 0;
        while (offset < size) {
          if (chunk.slice(offset, offset + 2) === "\r\n") {
            const piece = chunk.slice(start, offset);
            start = offset += 2;
            if (!piece.length) {
              continue;
            }
            try {
              const payload = JSON.parse(piece);
              if (payload) {
                this.emit(EStreamParserEvent.ParsedData, payload);
                continue;
              }
            } catch (error) {
              this.emit(EStreamParserEvent.ParseError, error);
            }
          }
          offset++;
        }
        this.currentMessage = chunk.slice(start, size);
      }
      /** Reset the currently stored message (f.e. on connection reset) */
      reset() {
        this.currentMessage = "";
      }
    };
    exports2.default = TweetStreamParser;
    var EStreamParserEvent;
    (function(EStreamParserEvent2) {
      EStreamParserEvent2["ParsedData"] = "parsed data";
      EStreamParserEvent2["ParseError"] = "parse error";
    })(EStreamParserEvent = exports2.EStreamParserEvent || (exports2.EStreamParserEvent = {}));
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/stream/TweetStream.js
var require_TweetStream = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/stream/TweetStream.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TweetStream = void 0;
    var events_1 = require("events");
    var request_handler_helper_1 = __importDefault(require_request_handler_helper());
    var types_1 = require_types();
    var TweetStreamEventCombiner_1 = __importDefault(require_TweetStreamEventCombiner());
    var TweetStreamParser_1 = __importStar(require_TweetStreamParser());
    var basicRetriesAttempt = [5, 15, 30, 60, 90, 120, 180, 300, 600, 900];
    var basicReconnectRetry = (tryOccurrence) => tryOccurrence > basicRetriesAttempt.length ? 901e3 : basicRetriesAttempt[tryOccurrence - 1] * 1e3;
    var TweetStream = class extends events_1.EventEmitter {
      constructor(requestData, connection) {
        super();
        this.requestData = requestData;
        this.autoReconnect = false;
        this.autoReconnectRetries = 5;
        this.keepAliveTimeoutMs = 1e3 * 120;
        this.nextRetryTimeout = basicReconnectRetry;
        this.parser = new TweetStreamParser_1.default();
        this.connectionProcessRunning = false;
        this.onKeepAliveTimeout = this.onKeepAliveTimeout.bind(this);
        this.initEventsFromParser();
        if (connection) {
          this.req = connection.req;
          this.res = connection.res;
          this.originalResponse = connection.originalResponse;
          this.initEventsFromRequest();
        }
      }
      on(event, handler2) {
        return super.on(event, handler2);
      }
      initEventsFromRequest() {
        if (!this.req || !this.res) {
          throw new Error("TweetStream error: You cannot init TweetStream without a request and response object.");
        }
        const errorHandler = (err) => {
          this.emit(types_1.ETwitterStreamEvent.ConnectionError, err);
          this.emit(types_1.ETwitterStreamEvent.Error, {
            type: types_1.ETwitterStreamEvent.ConnectionError,
            error: err,
            message: "Connection lost or closed by Twitter."
          });
          this.onConnectionError();
        };
        this.req.on("error", errorHandler);
        this.res.on("error", errorHandler);
        this.res.on("close", () => errorHandler(new Error("Connection closed by Twitter.")));
        this.res.on("data", (chunk) => {
          this.resetKeepAliveTimeout();
          if (chunk.toString() === "\r\n") {
            return this.emit(types_1.ETwitterStreamEvent.DataKeepAlive);
          }
          this.parser.push(chunk.toString());
        });
        this.resetKeepAliveTimeout();
      }
      initEventsFromParser() {
        const payloadIsError = this.requestData.payloadIsError;
        this.parser.on(TweetStreamParser_1.EStreamParserEvent.ParsedData, (eventData) => {
          if (payloadIsError && payloadIsError(eventData)) {
            this.emit(types_1.ETwitterStreamEvent.DataError, eventData);
            this.emit(types_1.ETwitterStreamEvent.Error, {
              type: types_1.ETwitterStreamEvent.DataError,
              error: eventData,
              message: "Twitter sent a payload that is detected as an error payload."
            });
          } else {
            this.emit(types_1.ETwitterStreamEvent.Data, eventData);
          }
        });
        this.parser.on(TweetStreamParser_1.EStreamParserEvent.ParseError, (error) => {
          this.emit(types_1.ETwitterStreamEvent.TweetParseError, error);
          this.emit(types_1.ETwitterStreamEvent.Error, {
            type: types_1.ETwitterStreamEvent.TweetParseError,
            error,
            message: "Failed to parse stream data."
          });
        });
      }
      resetKeepAliveTimeout() {
        this.unbindKeepAliveTimeout();
        if (this.keepAliveTimeoutMs !== Infinity) {
          this.keepAliveTimeout = setTimeout(this.onKeepAliveTimeout, this.keepAliveTimeoutMs);
        }
      }
      onKeepAliveTimeout() {
        this.emit(types_1.ETwitterStreamEvent.ConnectionLost);
        this.onConnectionError();
      }
      unbindTimeouts() {
        this.unbindRetryTimeout();
        this.unbindKeepAliveTimeout();
      }
      unbindKeepAliveTimeout() {
        if (this.keepAliveTimeout) {
          clearTimeout(this.keepAliveTimeout);
          this.keepAliveTimeout = void 0;
        }
      }
      unbindRetryTimeout() {
        if (this.retryTimeout) {
          clearTimeout(this.retryTimeout);
          this.retryTimeout = void 0;
        }
      }
      closeWithoutEmit() {
        this.unbindTimeouts();
        if (this.res) {
          this.res.removeAllListeners();
          this.res.destroy();
        }
        if (this.req) {
          this.req.removeAllListeners();
          this.req.destroy();
        }
      }
      /** Terminate connection to Twitter. */
      close() {
        this.emit(types_1.ETwitterStreamEvent.ConnectionClosed);
        this.closeWithoutEmit();
      }
      /** Unbind all listeners, and close connection. */
      destroy() {
        this.removeAllListeners();
        this.close();
      }
      /**
       * Make a new request that creates a new `TweetStream` instance with
       * the same parameters, and bind current listeners to new stream.
       */
      async clone() {
        const newRequest = new request_handler_helper_1.default(this.requestData);
        const newStream = await newRequest.makeRequestAsStream();
        const listenerNames = this.eventNames();
        for (const listener of listenerNames) {
          const callbacks = this.listeners(listener);
          for (const callback of callbacks) {
            newStream.on(listener, callback);
          }
        }
        return newStream;
      }
      /** Start initial stream connection, setup options on current instance and returns itself. */
      async connect(options = {}) {
        if (typeof options.autoReconnect !== "undefined") {
          this.autoReconnect = options.autoReconnect;
        }
        if (typeof options.autoReconnectRetries !== "undefined") {
          this.autoReconnectRetries = options.autoReconnectRetries === "unlimited" ? Infinity : options.autoReconnectRetries;
        }
        if (typeof options.keepAliveTimeout !== "undefined") {
          this.keepAliveTimeoutMs = options.keepAliveTimeout === "disable" ? Infinity : options.keepAliveTimeout;
        }
        if (typeof options.nextRetryTimeout !== "undefined") {
          this.nextRetryTimeout = options.nextRetryTimeout;
        }
        this.unbindTimeouts();
        try {
          await this.reconnect();
        } catch (e) {
          this.emit(types_1.ETwitterStreamEvent.ConnectError, 0);
          this.emit(types_1.ETwitterStreamEvent.Error, {
            type: types_1.ETwitterStreamEvent.ConnectError,
            error: e,
            message: "Connect error - Initial connection just failed."
          });
          if (this.autoReconnect) {
            this.makeAutoReconnectRetry(0, e);
          } else {
            throw e;
          }
        }
        return this;
      }
      /** Make a new request to (re)connect to Twitter. */
      async reconnect() {
        if (this.connectionProcessRunning) {
          throw new Error("Connection process is already running.");
        }
        this.connectionProcessRunning = true;
        try {
          let initialConnection = true;
          if (this.req) {
            initialConnection = false;
            this.closeWithoutEmit();
          }
          const { req, res, originalResponse } = await new request_handler_helper_1.default(this.requestData).makeRequestAndResolveWhenReady();
          this.req = req;
          this.res = res;
          this.originalResponse = originalResponse;
          this.emit(initialConnection ? types_1.ETwitterStreamEvent.Connected : types_1.ETwitterStreamEvent.Reconnected);
          this.parser.reset();
          this.initEventsFromRequest();
        } finally {
          this.connectionProcessRunning = false;
        }
      }
      async onConnectionError(retryOccurrence = 0) {
        this.unbindTimeouts();
        this.closeWithoutEmit();
        if (!this.autoReconnect) {
          this.emit(types_1.ETwitterStreamEvent.ConnectionClosed);
          return;
        }
        if (retryOccurrence >= this.autoReconnectRetries) {
          this.emit(types_1.ETwitterStreamEvent.ReconnectLimitExceeded);
          this.emit(types_1.ETwitterStreamEvent.ConnectionClosed);
          return;
        }
        try {
          this.emit(types_1.ETwitterStreamEvent.ReconnectAttempt, retryOccurrence);
          await this.reconnect();
        } catch (e) {
          this.emit(types_1.ETwitterStreamEvent.ReconnectError, retryOccurrence);
          this.emit(types_1.ETwitterStreamEvent.Error, {
            type: types_1.ETwitterStreamEvent.ReconnectError,
            error: e,
            message: `Reconnect error - ${retryOccurrence + 1} attempts made yet.`
          });
          this.makeAutoReconnectRetry(retryOccurrence, e);
        }
      }
      makeAutoReconnectRetry(retryOccurrence, error) {
        const nextRetry = this.nextRetryTimeout(retryOccurrence + 1, error);
        this.retryTimeout = setTimeout(() => {
          this.onConnectionError(retryOccurrence + 1);
        }, nextRetry);
      }
      async *[Symbol.asyncIterator]() {
        const eventCombiner = new TweetStreamEventCombiner_1.default(this);
        try {
          while (true) {
            if (!this.req || this.req.aborted) {
              throw new Error("Connection closed");
            }
            if (eventCombiner.hasStack()) {
              yield* eventCombiner.popStack();
            }
            const { type, payload } = await eventCombiner.nextEvent();
            if (type === "error") {
              throw payload;
            }
          }
        } finally {
          eventCombiner.destroy();
        }
      }
    };
    exports2.TweetStream = TweetStream;
    exports2.default = TweetStream;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/plugins/helpers.js
var require_helpers2 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/plugins/helpers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.applyResponseHooks = exports2.hasRequestErrorPlugins = void 0;
    var types_1 = require_types();
    function hasRequestErrorPlugins(client) {
      var _a;
      if (!((_a = client.clientSettings.plugins) === null || _a === void 0 ? void 0 : _a.length)) {
        return false;
      }
      for (const plugin of client.clientSettings.plugins) {
        if (plugin.onRequestError || plugin.onResponseError) {
          return true;
        }
      }
      return false;
    }
    exports2.hasRequestErrorPlugins = hasRequestErrorPlugins;
    async function applyResponseHooks(requestParams, computedParams, requestOptions, error) {
      let override;
      if (error instanceof types_1.ApiRequestError || error instanceof types_1.ApiPartialResponseError) {
        override = await this.applyPluginMethod("onRequestError", {
          client: this,
          url: this.getUrlObjectFromUrlString(requestParams.url),
          params: requestParams,
          computedParams,
          requestOptions,
          error
        });
      } else if (error instanceof types_1.ApiResponseError) {
        override = await this.applyPluginMethod("onResponseError", {
          client: this,
          url: this.getUrlObjectFromUrlString(requestParams.url),
          params: requestParams,
          computedParams,
          requestOptions,
          error
        });
      }
      if (override && override instanceof types_1.TwitterApiPluginResponseOverride) {
        return override.value;
      }
      return Promise.reject(error);
    }
    exports2.applyResponseHooks = applyResponseHooks;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client-mixins/oauth1.helper.js
var require_oauth1_helper = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client-mixins/oauth1.helper.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OAuth1Helper = void 0;
    var crypto = __importStar(require("crypto"));
    var OAuth1Helper = class _OAuth1Helper {
      constructor(options) {
        this.nonceLength = 32;
        this.consumerKeys = options.consumerKeys;
      }
      static percentEncode(str) {
        return encodeURIComponent(str).replace(/!/g, "%21").replace(/\*/g, "%2A").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
      }
      hash(base, key) {
        return crypto.createHmac("sha1", key).update(base).digest("base64");
      }
      authorize(request, accessTokens = {}) {
        const oauthInfo = {
          oauth_consumer_key: this.consumerKeys.key,
          oauth_nonce: this.getNonce(),
          oauth_signature_method: "HMAC-SHA1",
          oauth_timestamp: this.getTimestamp(),
          oauth_version: "1.0"
        };
        if (accessTokens.key !== void 0) {
          oauthInfo.oauth_token = accessTokens.key;
        }
        if (!request.data) {
          request.data = {};
        }
        oauthInfo.oauth_signature = this.getSignature(request, accessTokens.secret, oauthInfo);
        return oauthInfo;
      }
      toHeader(oauthInfo) {
        const sorted = sortObject(oauthInfo);
        let header_value = "OAuth ";
        for (const element of sorted) {
          if (element.key.indexOf("oauth_") !== 0) {
            continue;
          }
          header_value += _OAuth1Helper.percentEncode(element.key) + '="' + _OAuth1Helper.percentEncode(element.value) + '",';
        }
        return {
          // Remove the last ,
          Authorization: header_value.slice(0, header_value.length - 1)
        };
      }
      getNonce() {
        const wordCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < this.nonceLength; i++) {
          result += wordCharacters[Math.trunc(Math.random() * wordCharacters.length)];
        }
        return result;
      }
      getTimestamp() {
        return Math.trunc((/* @__PURE__ */ new Date()).getTime() / 1e3);
      }
      getSignature(request, tokenSecret, oauthInfo) {
        return this.hash(this.getBaseString(request, oauthInfo), this.getSigningKey(tokenSecret));
      }
      getSigningKey(tokenSecret) {
        return _OAuth1Helper.percentEncode(this.consumerKeys.secret) + "&" + _OAuth1Helper.percentEncode(tokenSecret || "");
      }
      getBaseString(request, oauthInfo) {
        return request.method.toUpperCase() + "&" + _OAuth1Helper.percentEncode(this.getBaseUrl(request.url)) + "&" + _OAuth1Helper.percentEncode(this.getParameterString(request, oauthInfo));
      }
      getParameterString(request, oauthInfo) {
        const baseStringData = sortObject(percentEncodeData(mergeObject(oauthInfo, mergeObject(request.data, deParamUrl(request.url)))));
        let dataStr = "";
        for (const { key, value } of baseStringData) {
          if (value && Array.isArray(value)) {
            value.sort();
            let valString = "";
            value.forEach((item, i) => {
              valString += key + "=" + item;
              if (i < value.length) {
                valString += "&";
              }
            });
            dataStr += valString;
          } else {
            dataStr += key + "=" + value + "&";
          }
        }
        return dataStr.slice(0, dataStr.length - 1);
      }
      getBaseUrl(url) {
        return url.split("?")[0];
      }
    };
    exports2.OAuth1Helper = OAuth1Helper;
    exports2.default = OAuth1Helper;
    function mergeObject(obj1, obj2) {
      return {
        ...obj1 || {},
        ...obj2 || {}
      };
    }
    function sortObject(data) {
      return Object.keys(data).sort().map((key) => ({ key, value: data[key] }));
    }
    function deParam(string) {
      const split = string.split("&");
      const data = {};
      for (const coupleKeyValue of split) {
        const [key, value = ""] = coupleKeyValue.split("=");
        if (data[key]) {
          if (!Array.isArray(data[key])) {
            data[key] = [data[key]];
          }
          data[key].push(decodeURIComponent(value));
        } else {
          data[key] = decodeURIComponent(value);
        }
      }
      return data;
    }
    function deParamUrl(url) {
      const tmp = url.split("?");
      if (tmp.length === 1)
        return {};
      return deParam(tmp[1]);
    }
    function percentEncodeData(data) {
      const result = {};
      for (const key in data) {
        let value = data[key];
        if (value && Array.isArray(value)) {
          value = value.map((v) => OAuth1Helper.percentEncode(v));
        } else {
          value = OAuth1Helper.percentEncode(value);
        }
        result[OAuth1Helper.percentEncode(key)] = value;
      }
      return result;
    }
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client-mixins/form-data.helper.js
var require_form_data_helper = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client-mixins/form-data.helper.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FormDataHelper = void 0;
    var helpers_1 = require_helpers();
    var FormDataHelper = class _FormDataHelper {
      constructor() {
        this._boundary = "";
        this._chunks = [];
      }
      bodyAppend(...values) {
        const allAsBuffer = values.map((val) => val instanceof Buffer ? val : Buffer.from(val));
        this._chunks.push(...allAsBuffer);
      }
      append(field, value, contentType) {
        const convertedValue = value instanceof Buffer ? value : value.toString();
        const header = this.getMultipartHeader(field, convertedValue, contentType);
        this.bodyAppend(header, convertedValue, _FormDataHelper.LINE_BREAK);
      }
      getHeaders() {
        return {
          "content-type": "multipart/form-data; boundary=" + this.getBoundary()
        };
      }
      /** Length of form-data (including footer length). */
      getLength() {
        return this._chunks.reduce((acc, cur) => acc + cur.length, this.getMultipartFooter().length);
      }
      getBuffer() {
        const allChunks = [...this._chunks, this.getMultipartFooter()];
        const totalBuffer = Buffer.alloc(this.getLength());
        let i = 0;
        for (const chunk of allChunks) {
          for (let j = 0; j < chunk.length; i++, j++) {
            totalBuffer[i] = chunk[j];
          }
        }
        return totalBuffer;
      }
      getBoundary() {
        if (!this._boundary) {
          this.generateBoundary();
        }
        return this._boundary;
      }
      generateBoundary() {
        let boundary = "--------------------------";
        for (let i = 0; i < 24; i++) {
          boundary += Math.floor(Math.random() * 10).toString(16);
        }
        this._boundary = boundary;
      }
      getMultipartHeader(field, value, contentType) {
        if (!contentType) {
          contentType = value instanceof Buffer ? _FormDataHelper.DEFAULT_CONTENT_TYPE : "";
        }
        const headers = {
          "Content-Disposition": ["form-data", `name="${field}"`],
          "Content-Type": contentType
        };
        let contents = "";
        for (const [prop, header] of Object.entries(headers)) {
          if (!header.length) {
            continue;
          }
          contents += prop + ": " + (0, helpers_1.arrayWrap)(header).join("; ") + _FormDataHelper.LINE_BREAK;
        }
        return "--" + this.getBoundary() + _FormDataHelper.LINE_BREAK + contents + _FormDataHelper.LINE_BREAK;
      }
      getMultipartFooter() {
        if (this._footerChunk) {
          return this._footerChunk;
        }
        return this._footerChunk = Buffer.from("--" + this.getBoundary() + "--" + _FormDataHelper.LINE_BREAK);
      }
    };
    exports2.FormDataHelper = FormDataHelper;
    FormDataHelper.LINE_BREAK = "\r\n";
    FormDataHelper.DEFAULT_CONTENT_TYPE = "application/octet-stream";
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client-mixins/request-param.helper.js
var require_request_param_helper = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client-mixins/request-param.helper.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.RequestParamHelpers = void 0;
    var form_data_helper_1 = require_form_data_helper();
    var oauth1_helper_1 = __importDefault(require_oauth1_helper());
    var RequestParamHelpers = class {
      static formatQueryToString(query) {
        const formattedQuery = {};
        for (const prop in query) {
          if (typeof query[prop] === "string") {
            formattedQuery[prop] = query[prop];
          } else if (typeof query[prop] !== "undefined") {
            formattedQuery[prop] = String(query[prop]);
          }
        }
        return formattedQuery;
      }
      static autoDetectBodyType(url) {
        if (url.pathname.startsWith("/2/") || url.pathname.startsWith("/labs/2/")) {
          if (url.password.startsWith("/2/oauth2")) {
            return "url";
          }
          return "json";
        }
        if (url.hostname === "upload.x.com") {
          if (url.pathname === "/1.1/media/upload.json") {
            return "form-data";
          }
          return "json";
        }
        const endpoint = url.pathname.split("/1.1/", 2)[1];
        if (this.JSON_1_1_ENDPOINTS.has(endpoint)) {
          return "json";
        }
        return "url";
      }
      static addQueryParamsToUrl(url, query) {
        const queryEntries = Object.entries(query);
        if (queryEntries.length) {
          let search = "";
          for (const [key, value] of queryEntries) {
            search += (search.length ? "&" : "?") + `${oauth1_helper_1.default.percentEncode(key)}=${oauth1_helper_1.default.percentEncode(value)}`;
          }
          url.search = search;
        }
      }
      static constructBodyParams(body, headers, mode) {
        if (body instanceof Buffer) {
          return body;
        }
        if (mode === "json") {
          if (!headers["content-type"]) {
            headers["content-type"] = "application/json;charset=UTF-8";
          }
          return JSON.stringify(body);
        } else if (mode === "url") {
          if (!headers["content-type"]) {
            headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
          }
          if (Object.keys(body).length) {
            return new URLSearchParams(body).toString().replace(/\*/g, "%2A");
          }
          return "";
        } else if (mode === "raw") {
          throw new Error("You can only use raw body mode with Buffers. To give a string, use Buffer.from(str).");
        } else {
          const form = new form_data_helper_1.FormDataHelper();
          for (const parameter in body) {
            form.append(parameter, body[parameter]);
          }
          if (!headers["content-type"]) {
            const formHeaders = form.getHeaders();
            headers["content-type"] = formHeaders["content-type"];
          }
          return form.getBuffer();
        }
      }
      static setBodyLengthHeader(options, body) {
        var _a;
        options.headers = (_a = options.headers) !== null && _a !== void 0 ? _a : {};
        if (typeof body === "string") {
          options.headers["content-length"] = Buffer.byteLength(body);
        } else {
          options.headers["content-length"] = body.length;
        }
      }
      static isOAuthSerializable(item) {
        return !(item instanceof Buffer);
      }
      static mergeQueryAndBodyForOAuth(query, body) {
        const parameters = {};
        for (const prop in query) {
          parameters[prop] = query[prop];
        }
        if (this.isOAuthSerializable(body)) {
          for (const prop in body) {
            const bodyProp = body[prop];
            if (this.isOAuthSerializable(bodyProp)) {
              parameters[prop] = typeof bodyProp === "object" && bodyProp !== null && "toString" in bodyProp ? bodyProp.toString() : bodyProp;
            }
          }
        }
        return parameters;
      }
      static moveUrlQueryParamsIntoObject(url, query) {
        for (const [param, value] of url.searchParams) {
          query[param] = value;
        }
        url.search = "";
        return url;
      }
      /**
       * Replace URL parameters available in pathname, like `:id`, with data given in `parameters`:
       * `https://x.com/:id.json` + `{ id: '20' }` => `https://x.com/20.json`
       */
      static applyRequestParametersToUrl(url, parameters) {
        url.pathname = url.pathname.replace(/:([A-Z_-]+)/ig, (fullMatch, paramName) => {
          if (parameters[paramName] !== void 0) {
            return String(parameters[paramName]);
          }
          return fullMatch;
        });
        return url;
      }
    };
    exports2.RequestParamHelpers = RequestParamHelpers;
    RequestParamHelpers.JSON_1_1_ENDPOINTS = /* @__PURE__ */ new Set([
      "direct_messages/events/new.json",
      "direct_messages/welcome_messages/new.json",
      "direct_messages/welcome_messages/rules/new.json",
      "media/metadata/create.json",
      "collections/entries/curate.json"
    ]);
    exports2.default = RequestParamHelpers;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client-mixins/oauth2.helper.js
var require_oauth2_helper = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client-mixins/oauth2.helper.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OAuth2Helper = void 0;
    var crypto = __importStar(require("crypto"));
    var OAuth2Helper = class {
      static getCodeVerifier() {
        return this.generateRandomString(128);
      }
      static getCodeChallengeFromVerifier(verifier) {
        return this.escapeBase64Url(crypto.createHash("sha256").update(verifier).digest("base64"));
      }
      static getAuthHeader(clientId, clientSecret) {
        const key = encodeURIComponent(clientId) + ":" + encodeURIComponent(clientSecret);
        return Buffer.from(key).toString("base64");
      }
      static generateRandomString(length) {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        for (let i = 0; i < length; i++) {
          text += possible[Math.floor(Math.random() * possible.length)];
        }
        return text;
      }
      static escapeBase64Url(string) {
        return string.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      }
    };
    exports2.OAuth2Helper = OAuth2Helper;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client-mixins/request-maker.mixin.js
var require_request_maker_mixin = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client-mixins/request-maker.mixin.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ClientRequestMaker = void 0;
    var types_1 = require_types();
    var TweetStream_1 = __importDefault(require_TweetStream());
    var helpers_1 = require_helpers2();
    var helpers_2 = require_helpers();
    var oauth1_helper_1 = __importDefault(require_oauth1_helper());
    var request_handler_helper_1 = __importDefault(require_request_handler_helper());
    var request_param_helper_1 = __importDefault(require_request_param_helper());
    var oauth2_helper_1 = require_oauth2_helper();
    var ClientRequestMaker = class _ClientRequestMaker {
      constructor(settings) {
        this.rateLimits = {};
        this.clientSettings = {};
        if (settings) {
          this.clientSettings = settings;
        }
      }
      /** @deprecated - Switch to `@twitter-api-v2/plugin-rate-limit` */
      getRateLimits() {
        return this.rateLimits;
      }
      saveRateLimit(originalUrl, rateLimit) {
        this.rateLimits[originalUrl] = rateLimit;
      }
      /** Send a new request and returns a wrapped `Promise<TwitterResponse<T>`. */
      async send(requestParams) {
        var _a, _b, _c, _d, _e;
        if ((_a = this.clientSettings.plugins) === null || _a === void 0 ? void 0 : _a.length) {
          const possibleResponse = await this.applyPreRequestConfigHooks(requestParams);
          if (possibleResponse) {
            return possibleResponse;
          }
        }
        const args = this.getHttpRequestArgs(requestParams);
        const options = {
          method: args.method,
          headers: args.headers,
          timeout: requestParams.timeout,
          agent: this.clientSettings.httpAgent
        };
        const enableRateLimitSave = requestParams.enableRateLimitSave !== false;
        if (args.body) {
          request_param_helper_1.default.setBodyLengthHeader(options, args.body);
        }
        if ((_b = this.clientSettings.plugins) === null || _b === void 0 ? void 0 : _b.length) {
          await this.applyPreRequestHooks(requestParams, args, options);
        }
        let request = new request_handler_helper_1.default({
          url: args.url,
          options,
          body: args.body,
          rateLimitSaver: enableRateLimitSave ? this.saveRateLimit.bind(this, args.rawUrl) : void 0,
          requestEventDebugHandler: requestParams.requestEventDebugHandler,
          compression: (_d = (_c = requestParams.compression) !== null && _c !== void 0 ? _c : this.clientSettings.compression) !== null && _d !== void 0 ? _d : true,
          forceParseMode: requestParams.forceParseMode
        }).makeRequest();
        if ((0, helpers_1.hasRequestErrorPlugins)(this)) {
          request = this.applyResponseErrorHooks(requestParams, args, options, request);
        }
        const response = await request;
        if ((_e = this.clientSettings.plugins) === null || _e === void 0 ? void 0 : _e.length) {
          const responseOverride = await this.applyPostRequestHooks(requestParams, args, options, response);
          if (responseOverride) {
            return responseOverride.value;
          }
        }
        return response;
      }
      sendStream(requestParams) {
        var _a, _b;
        if (this.clientSettings.plugins) {
          this.applyPreStreamRequestConfigHooks(requestParams);
        }
        const args = this.getHttpRequestArgs(requestParams);
        const options = {
          method: args.method,
          headers: args.headers,
          agent: this.clientSettings.httpAgent
        };
        const enableRateLimitSave = requestParams.enableRateLimitSave !== false;
        const enableAutoConnect = requestParams.autoConnect !== false;
        if (args.body) {
          request_param_helper_1.default.setBodyLengthHeader(options, args.body);
        }
        const requestData = {
          url: args.url,
          options,
          body: args.body,
          rateLimitSaver: enableRateLimitSave ? this.saveRateLimit.bind(this, args.rawUrl) : void 0,
          payloadIsError: requestParams.payloadIsError,
          compression: (_b = (_a = requestParams.compression) !== null && _a !== void 0 ? _a : this.clientSettings.compression) !== null && _b !== void 0 ? _b : true
        };
        const stream = new TweetStream_1.default(requestData);
        if (!enableAutoConnect) {
          return stream;
        }
        return stream.connect();
      }
      /* Token helpers */
      initializeToken(token) {
        if (typeof token === "string") {
          this.bearerToken = token;
        } else if (typeof token === "object" && "appKey" in token) {
          this.consumerToken = token.appKey;
          this.consumerSecret = token.appSecret;
          if (token.accessToken && token.accessSecret) {
            this.accessToken = token.accessToken;
            this.accessSecret = token.accessSecret;
          }
          this._oauth = this.buildOAuth();
        } else if (typeof token === "object" && "username" in token) {
          const key = encodeURIComponent(token.username) + ":" + encodeURIComponent(token.password);
          this.basicToken = Buffer.from(key).toString("base64");
        } else if (typeof token === "object" && "clientId" in token) {
          this.clientId = token.clientId;
          this.clientSecret = token.clientSecret;
        }
      }
      getActiveTokens() {
        if (this.bearerToken) {
          return {
            type: "oauth2",
            bearerToken: this.bearerToken
          };
        } else if (this.basicToken) {
          return {
            type: "basic",
            token: this.basicToken
          };
        } else if (this.consumerSecret && this._oauth) {
          return {
            type: "oauth-1.0a",
            appKey: this.consumerToken,
            appSecret: this.consumerSecret,
            accessToken: this.accessToken,
            accessSecret: this.accessSecret
          };
        } else if (this.clientId) {
          return {
            type: "oauth2-user",
            clientId: this.clientId
          };
        }
        return { type: "none" };
      }
      buildOAuth() {
        if (!this.consumerSecret || !this.consumerToken)
          throw new Error("Invalid consumer tokens");
        return new oauth1_helper_1.default({
          consumerKeys: { key: this.consumerToken, secret: this.consumerSecret }
        });
      }
      getOAuthAccessTokens() {
        if (!this.accessSecret || !this.accessToken)
          return;
        return {
          key: this.accessToken,
          secret: this.accessSecret
        };
      }
      /* Plugin helpers */
      getPlugins() {
        var _a;
        return (_a = this.clientSettings.plugins) !== null && _a !== void 0 ? _a : [];
      }
      hasPlugins() {
        var _a;
        return !!((_a = this.clientSettings.plugins) === null || _a === void 0 ? void 0 : _a.length);
      }
      async applyPluginMethod(method, args) {
        var _a;
        let returnValue;
        for (const plugin of this.getPlugins()) {
          const value = await ((_a = plugin[method]) === null || _a === void 0 ? void 0 : _a.call(plugin, args));
          if (value && value instanceof types_1.TwitterApiPluginResponseOverride) {
            returnValue = value;
          }
        }
        return returnValue;
      }
      /* Request helpers */
      writeAuthHeaders({ headers, bodyInSignature, url, method, query, body }) {
        headers = { ...headers };
        if (this.bearerToken) {
          headers.Authorization = "Bearer " + this.bearerToken;
        } else if (this.basicToken) {
          headers.Authorization = "Basic " + this.basicToken;
        } else if (this.clientId && this.clientSecret) {
          headers.Authorization = "Basic " + oauth2_helper_1.OAuth2Helper.getAuthHeader(this.clientId, this.clientSecret);
        } else if (this.consumerSecret && this._oauth) {
          const data = bodyInSignature ? request_param_helper_1.default.mergeQueryAndBodyForOAuth(query, body) : query;
          const auth = this._oauth.authorize({
            url: url.toString(),
            method,
            data
          }, this.getOAuthAccessTokens());
          headers = { ...headers, ...this._oauth.toHeader(auth) };
        }
        return headers;
      }
      getUrlObjectFromUrlString(url) {
        if (!url.startsWith("http")) {
          url = "https://" + url;
        }
        return new URL(url);
      }
      getHttpRequestArgs({ url: stringUrl, method, query: rawQuery = {}, body: rawBody = {}, headers, forceBodyMode, enableAuth, params }) {
        let body = void 0;
        method = method.toUpperCase();
        headers = headers !== null && headers !== void 0 ? headers : {};
        if (!headers["x-user-agent"]) {
          headers["x-user-agent"] = "Node.twitter-api-v2";
        }
        const url = this.getUrlObjectFromUrlString(stringUrl);
        const rawUrl = url.origin + url.pathname;
        if (params) {
          request_param_helper_1.default.applyRequestParametersToUrl(url, params);
        }
        const query = request_param_helper_1.default.formatQueryToString(rawQuery);
        request_param_helper_1.default.moveUrlQueryParamsIntoObject(url, query);
        if (!(rawBody instanceof Buffer)) {
          (0, helpers_2.trimUndefinedProperties)(rawBody);
        }
        const bodyType = forceBodyMode !== null && forceBodyMode !== void 0 ? forceBodyMode : request_param_helper_1.default.autoDetectBodyType(url);
        if (enableAuth !== false) {
          const bodyInSignature = _ClientRequestMaker.BODY_METHODS.has(method) && bodyType === "url";
          headers = this.writeAuthHeaders({ headers, bodyInSignature, method, query, url, body: rawBody });
        }
        if (_ClientRequestMaker.BODY_METHODS.has(method)) {
          body = request_param_helper_1.default.constructBodyParams(rawBody, headers, bodyType) || void 0;
        }
        request_param_helper_1.default.addQueryParamsToUrl(url, query);
        return {
          rawUrl,
          url,
          method,
          headers,
          body
        };
      }
      /* Plugin helpers */
      async applyPreRequestConfigHooks(requestParams) {
        var _a;
        const url = this.getUrlObjectFromUrlString(requestParams.url);
        for (const plugin of this.getPlugins()) {
          const result = await ((_a = plugin.onBeforeRequestConfig) === null || _a === void 0 ? void 0 : _a.call(plugin, {
            client: this,
            url,
            params: requestParams
          }));
          if (result) {
            return result;
          }
        }
      }
      applyPreStreamRequestConfigHooks(requestParams) {
        var _a;
        const url = this.getUrlObjectFromUrlString(requestParams.url);
        for (const plugin of this.getPlugins()) {
          (_a = plugin.onBeforeStreamRequestConfig) === null || _a === void 0 ? void 0 : _a.call(plugin, {
            client: this,
            url,
            params: requestParams
          });
        }
      }
      async applyPreRequestHooks(requestParams, computedParams, requestOptions) {
        await this.applyPluginMethod("onBeforeRequest", {
          client: this,
          url: this.getUrlObjectFromUrlString(requestParams.url),
          params: requestParams,
          computedParams,
          requestOptions
        });
      }
      async applyPostRequestHooks(requestParams, computedParams, requestOptions, response) {
        return await this.applyPluginMethod("onAfterRequest", {
          client: this,
          url: this.getUrlObjectFromUrlString(requestParams.url),
          params: requestParams,
          computedParams,
          requestOptions,
          response
        });
      }
      applyResponseErrorHooks(requestParams, computedParams, requestOptions, promise) {
        return promise.catch(helpers_1.applyResponseHooks.bind(this, requestParams, computedParams, requestOptions));
      }
    };
    exports2.ClientRequestMaker = ClientRequestMaker;
    ClientRequestMaker.BODY_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH"]);
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client.base.js
var require_client_base = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client.base.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var request_maker_mixin_1 = require_request_maker_mixin();
    var helpers_1 = require_helpers();
    var globals_1 = require_globals();
    var TwitterApiBase = class _TwitterApiBase {
      constructor(token, settings = {}) {
        this._currentUser = null;
        this._currentUserV2 = null;
        if (token instanceof _TwitterApiBase) {
          this._requestMaker = token._requestMaker;
        } else {
          this._requestMaker = new request_maker_mixin_1.ClientRequestMaker(settings);
          this._requestMaker.initializeToken(token);
        }
      }
      /* Prefix/Token handling */
      setPrefix(prefix) {
        this._prefix = prefix;
      }
      cloneWithPrefix(prefix) {
        const clone = this.constructor(this);
        clone.setPrefix(prefix);
        return clone;
      }
      getActiveTokens() {
        return this._requestMaker.getActiveTokens();
      }
      /* Rate limit cache / Plugins */
      getPlugins() {
        return this._requestMaker.getPlugins();
      }
      getPluginOfType(type) {
        return this.getPlugins().find((plugin) => plugin instanceof type);
      }
      /**
       * @deprecated - Migrate to plugin `@twitter-api-v2/plugin-rate-limit`
       *
       * Tells if you hit the Twitter rate limit for {endpoint}.
       * (local data only, this should not ask anything to Twitter)
       */
      hasHitRateLimit(endpoint) {
        var _a;
        if (this.isRateLimitStatusObsolete(endpoint)) {
          return false;
        }
        return ((_a = this.getLastRateLimitStatus(endpoint)) === null || _a === void 0 ? void 0 : _a.remaining) === 0;
      }
      /**
       * @deprecated - Migrate to plugin `@twitter-api-v2/plugin-rate-limit`
       *
       * Tells if you hit the returned Twitter rate limit for {endpoint} has expired.
       * If client has no saved rate limit data for {endpoint}, this will gives you `true`.
       */
      isRateLimitStatusObsolete(endpoint) {
        const rateLimit = this.getLastRateLimitStatus(endpoint);
        if (rateLimit === void 0) {
          return true;
        }
        return rateLimit.reset * 1e3 < Date.now();
      }
      /**
       * @deprecated - Migrate to plugin `@twitter-api-v2/plugin-rate-limit`
       *
       * Get the last obtained Twitter rate limit information for {endpoint}.
       * (local data only, this should not ask anything to Twitter)
       */
      getLastRateLimitStatus(endpoint) {
        const endpointWithPrefix = endpoint.match(/^https?:\/\//) ? endpoint : this._prefix + endpoint;
        return this._requestMaker.getRateLimits()[endpointWithPrefix];
      }
      /* Current user cache */
      /** Get cached current user. */
      getCurrentUserObject(forceFetch = false) {
        if (!forceFetch && this._currentUser) {
          if (this._currentUser.value) {
            return Promise.resolve(this._currentUser.value);
          }
          return this._currentUser.promise;
        }
        this._currentUser = (0, helpers_1.sharedPromise)(() => this.get("account/verify_credentials.json", { tweet_mode: "extended" }, { prefix: globals_1.API_V1_1_PREFIX }));
        return this._currentUser.promise;
      }
      /**
       * Get cached current user from v2 API.
       * This can only be the slimest available `UserV2` object, with only `id`, `name` and `username` properties defined.
       *
       * To get a customized `UserV2Result`, use `.v2.me()`
       *
       * OAuth2 scopes: `tweet.read` & `users.read`
       */
      getCurrentUserV2Object(forceFetch = false) {
        if (!forceFetch && this._currentUserV2) {
          if (this._currentUserV2.value) {
            return Promise.resolve(this._currentUserV2.value);
          }
          return this._currentUserV2.promise;
        }
        this._currentUserV2 = (0, helpers_1.sharedPromise)(() => this.get("users/me", void 0, { prefix: globals_1.API_V2_PREFIX }));
        return this._currentUserV2.promise;
      }
      async get(url, query = {}, { fullResponse, prefix = this._prefix, ...rest } = {}) {
        if (prefix)
          url = prefix + url;
        const resp = await this._requestMaker.send({
          url,
          method: "GET",
          query,
          ...rest
        });
        return fullResponse ? resp : resp.data;
      }
      async delete(url, query = {}, { fullResponse, prefix = this._prefix, ...rest } = {}) {
        if (prefix)
          url = prefix + url;
        const resp = await this._requestMaker.send({
          url,
          method: "DELETE",
          query,
          ...rest
        });
        return fullResponse ? resp : resp.data;
      }
      async post(url, body, { fullResponse, prefix = this._prefix, ...rest } = {}) {
        if (prefix)
          url = prefix + url;
        const resp = await this._requestMaker.send({
          url,
          method: "POST",
          body,
          ...rest
        });
        return fullResponse ? resp : resp.data;
      }
      async put(url, body, { fullResponse, prefix = this._prefix, ...rest } = {}) {
        if (prefix)
          url = prefix + url;
        const resp = await this._requestMaker.send({
          url,
          method: "PUT",
          body,
          ...rest
        });
        return fullResponse ? resp : resp.data;
      }
      async patch(url, body, { fullResponse, prefix = this._prefix, ...rest } = {}) {
        if (prefix)
          url = prefix + url;
        const resp = await this._requestMaker.send({
          url,
          method: "PATCH",
          body,
          ...rest
        });
        return fullResponse ? resp : resp.data;
      }
      getStream(url, query, { prefix = this._prefix, ...rest } = {}) {
        return this._requestMaker.sendStream({
          url: prefix ? prefix + url : url,
          method: "GET",
          query,
          ...rest
        });
      }
      postStream(url, body, { prefix = this._prefix, ...rest } = {}) {
        return this._requestMaker.sendStream({
          url: prefix ? prefix + url : url,
          method: "POST",
          body,
          ...rest
        });
      }
    };
    exports2.default = TwitterApiBase;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client.subclient.js
var require_client_subclient = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client.subclient.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var client_base_1 = __importDefault(require_client_base());
    var TwitterApiSubClient = class extends client_base_1.default {
      constructor(instance) {
        if (!(instance instanceof client_base_1.default)) {
          throw new Error("You must instance SubTwitterApi instance from existing TwitterApi instance.");
        }
        super(instance);
      }
    };
    exports2.default = TwitterApiSubClient;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/tweet.paginator.v1.js
var require_tweet_paginator_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/tweet.paginator.v1.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.UserFavoritesV1Paginator = exports2.ListTimelineV1Paginator = exports2.UserTimelineV1Paginator = exports2.MentionTimelineV1Paginator = exports2.HomeTimelineV1Paginator = void 0;
    var TwitterPaginator_1 = __importDefault(require_TwitterPaginator());
    var TweetTimelineV1Paginator = class extends TwitterPaginator_1.default {
      constructor() {
        super(...arguments);
        this.hasFinishedFetch = false;
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.push(...result);
          this.hasFinishedFetch = result.length === 0;
        }
      }
      getNextQueryParams(maxResults) {
        const latestId = BigInt(this._realData[this._realData.length - 1].id_str);
        return {
          ...this.injectQueryParams(maxResults),
          max_id: (latestId - BigInt(1)).toString()
        };
      }
      getPageLengthFromRequest(result) {
        return result.data.length;
      }
      isFetchLastOver(result) {
        return !result.data.length;
      }
      canFetchNextPage(result) {
        return result.length > 0;
      }
      getItemArray() {
        return this.tweets;
      }
      /**
       * Tweets returned by paginator.
       */
      get tweets() {
        return this._realData;
      }
      get done() {
        return super.done || this.hasFinishedFetch;
      }
    };
    var HomeTimelineV1Paginator = class extends TweetTimelineV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "statuses/home_timeline.json";
      }
    };
    exports2.HomeTimelineV1Paginator = HomeTimelineV1Paginator;
    var MentionTimelineV1Paginator = class extends TweetTimelineV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "statuses/mentions_timeline.json";
      }
    };
    exports2.MentionTimelineV1Paginator = MentionTimelineV1Paginator;
    var UserTimelineV1Paginator = class extends TweetTimelineV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "statuses/user_timeline.json";
      }
    };
    exports2.UserTimelineV1Paginator = UserTimelineV1Paginator;
    var ListTimelineV1Paginator = class extends TweetTimelineV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/statuses.json";
      }
    };
    exports2.ListTimelineV1Paginator = ListTimelineV1Paginator;
    var UserFavoritesV1Paginator = class extends TweetTimelineV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "favorites/list.json";
      }
    };
    exports2.UserFavoritesV1Paginator = UserFavoritesV1Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/mutes.paginator.v1.js
var require_mutes_paginator_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/mutes.paginator.v1.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MuteUserIdsV1Paginator = exports2.MuteUserListV1Paginator = void 0;
    var paginator_v1_1 = require_paginator_v1();
    var MuteUserListV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "mutes/users/list.json";
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.users.push(...result.users);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.users.length;
      }
      getItemArray() {
        return this.users;
      }
      /**
       * Users returned by paginator.
       */
      get users() {
        return this._realData.users;
      }
    };
    exports2.MuteUserListV1Paginator = MuteUserListV1Paginator;
    var MuteUserIdsV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "mutes/users/ids.json";
        this._maxResultsWhenFetchLast = 5e3;
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.ids.push(...result.ids);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.ids.length;
      }
      getItemArray() {
        return this.ids;
      }
      /**
       * Users IDs returned by paginator.
       */
      get ids() {
        return this._realData.ids;
      }
    };
    exports2.MuteUserIdsV1Paginator = MuteUserIdsV1Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/followers.paginator.v1.js
var require_followers_paginator_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/followers.paginator.v1.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.UserFollowerIdsV1Paginator = exports2.UserFollowerListV1Paginator = void 0;
    var paginator_v1_1 = require_paginator_v1();
    var UserFollowerListV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "followers/list.json";
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.users.push(...result.users);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.users.length;
      }
      getItemArray() {
        return this.users;
      }
      /**
       * Users returned by paginator.
       */
      get users() {
        return this._realData.users;
      }
    };
    exports2.UserFollowerListV1Paginator = UserFollowerListV1Paginator;
    var UserFollowerIdsV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "followers/ids.json";
        this._maxResultsWhenFetchLast = 5e3;
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.ids.push(...result.ids);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.ids.length;
      }
      getItemArray() {
        return this.ids;
      }
      /**
       * Users IDs returned by paginator.
       */
      get ids() {
        return this._realData.ids;
      }
    };
    exports2.UserFollowerIdsV1Paginator = UserFollowerIdsV1Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/friends.paginator.v1.js
var require_friends_paginator_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/friends.paginator.v1.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.UserFollowersIdsV1Paginator = exports2.UserFriendListV1Paginator = void 0;
    var paginator_v1_1 = require_paginator_v1();
    var UserFriendListV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "friends/list.json";
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.users.push(...result.users);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.users.length;
      }
      getItemArray() {
        return this.users;
      }
      /**
       * Users returned by paginator.
       */
      get users() {
        return this._realData.users;
      }
    };
    exports2.UserFriendListV1Paginator = UserFriendListV1Paginator;
    var UserFollowersIdsV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "friends/ids.json";
        this._maxResultsWhenFetchLast = 5e3;
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.ids.push(...result.ids);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.ids.length;
      }
      getItemArray() {
        return this.ids;
      }
      /**
       * Users IDs returned by paginator.
       */
      get ids() {
        return this._realData.ids;
      }
    };
    exports2.UserFollowersIdsV1Paginator = UserFollowersIdsV1Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/user.paginator.v1.js
var require_user_paginator_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/user.paginator.v1.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FriendshipsOutgoingV1Paginator = exports2.FriendshipsIncomingV1Paginator = exports2.UserSearchV1Paginator = void 0;
    var TwitterPaginator_1 = __importDefault(require_TwitterPaginator());
    var paginator_v1_1 = require_paginator_v1();
    var UserSearchV1Paginator = class extends TwitterPaginator_1.default {
      constructor() {
        super(...arguments);
        this._endpoint = "users/search.json";
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.push(...result);
        }
      }
      getNextQueryParams(maxResults) {
        var _a;
        const previousPage = Number((_a = this._queryParams.page) !== null && _a !== void 0 ? _a : "1");
        return {
          ...this._queryParams,
          page: previousPage + 1,
          ...maxResults ? { count: maxResults } : {}
        };
      }
      getPageLengthFromRequest(result) {
        return result.data.length;
      }
      isFetchLastOver(result) {
        return !result.data.length;
      }
      canFetchNextPage(result) {
        return result.length > 0;
      }
      getItemArray() {
        return this.users;
      }
      /**
       * Users returned by paginator.
       */
      get users() {
        return this._realData;
      }
    };
    exports2.UserSearchV1Paginator = UserSearchV1Paginator;
    var FriendshipsIncomingV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "friendships/incoming.json";
        this._maxResultsWhenFetchLast = 5e3;
      }
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.ids.push(...result.ids);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.ids.length;
      }
      getItemArray() {
        return this.ids;
      }
      /**
       * Users IDs returned by paginator.
       */
      get ids() {
        return this._realData.ids;
      }
    };
    exports2.FriendshipsIncomingV1Paginator = FriendshipsIncomingV1Paginator;
    var FriendshipsOutgoingV1Paginator = class extends FriendshipsIncomingV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "friendships/outgoing.json";
      }
    };
    exports2.FriendshipsOutgoingV1Paginator = FriendshipsOutgoingV1Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/list.paginator.v1.js
var require_list_paginator_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/list.paginator.v1.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ListSubscribersV1Paginator = exports2.ListMembersV1Paginator = exports2.ListSubscriptionsV1Paginator = exports2.ListOwnershipsV1Paginator = exports2.ListMembershipsV1Paginator = void 0;
    var paginator_v1_1 = require_paginator_v1();
    var ListListsV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.lists.push(...result.lists);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.lists.length;
      }
      getItemArray() {
        return this.lists;
      }
      /**
       * Lists returned by paginator.
       */
      get lists() {
        return this._realData.lists;
      }
    };
    var ListMembershipsV1Paginator = class extends ListListsV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/memberships.json";
      }
    };
    exports2.ListMembershipsV1Paginator = ListMembershipsV1Paginator;
    var ListOwnershipsV1Paginator = class extends ListListsV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/ownerships.json";
      }
    };
    exports2.ListOwnershipsV1Paginator = ListOwnershipsV1Paginator;
    var ListSubscriptionsV1Paginator = class extends ListListsV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/subscriptions.json";
      }
    };
    exports2.ListSubscriptionsV1Paginator = ListSubscriptionsV1Paginator;
    var ListUsersV1Paginator = class extends paginator_v1_1.CursoredV1Paginator {
      refreshInstanceFromResult(response, isNextPage) {
        const result = response.data;
        this._rateLimit = response.rateLimit;
        if (isNextPage) {
          this._realData.users.push(...result.users);
          this._realData.next_cursor = result.next_cursor;
        }
      }
      getPageLengthFromRequest(result) {
        return result.data.users.length;
      }
      getItemArray() {
        return this.users;
      }
      /**
       * Users returned by paginator.
       */
      get users() {
        return this._realData.users;
      }
    };
    var ListMembersV1Paginator = class extends ListUsersV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/members.json";
      }
    };
    exports2.ListMembersV1Paginator = ListMembersV1Paginator;
    var ListSubscribersV1Paginator = class extends ListUsersV1Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/subscribers.json";
      }
    };
    exports2.ListSubscribersV1Paginator = ListSubscribersV1Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v1/client.v1.read.js
var require_client_v1_read = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v1/client.v1.read.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var client_subclient_1 = __importDefault(require_client_subclient());
    var globals_1 = require_globals();
    var helpers_1 = require_helpers();
    var client_v1_1 = __importDefault(require_client_v1());
    var tweet_paginator_v1_1 = require_tweet_paginator_v1();
    var mutes_paginator_v1_1 = require_mutes_paginator_v1();
    var followers_paginator_v1_1 = require_followers_paginator_v1();
    var friends_paginator_v1_1 = require_friends_paginator_v1();
    var user_paginator_v1_1 = require_user_paginator_v1();
    var list_paginator_v1_1 = require_list_paginator_v1();
    var TwitterApiv1ReadOnly = class extends client_subclient_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V1_1_PREFIX;
      }
      /* Tweets */
      /**
       * Returns a single Tweet, specified by the id parameter. The Tweet's author will also be embedded within the Tweet.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-statuses-show-id
       */
      singleTweet(tweetId, options = {}) {
        return this.get("statuses/show.json", { tweet_mode: "extended", id: tweetId, ...options });
      }
      tweets(ids, options = {}) {
        return this.post("statuses/lookup.json", { tweet_mode: "extended", id: ids, ...options });
      }
      /**
       * Returns a single Tweet, specified by either a Tweet web URL or the Tweet ID, in an oEmbed-compatible format.
       * The returned HTML snippet will be automatically recognized as an Embedded Tweet when Twitter's widget JavaScript is included on the page.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-statuses-oembed
       */
      oembedTweet(tweetId, options = {}) {
        return this.get("oembed", {
          url: `https://x.com/i/statuses/${tweetId}`,
          ...options
        }, { prefix: "https://publish.x.com/" });
      }
      /* Tweets timelines */
      /**
       * Returns a collection of the most recent Tweets and Retweets posted by the authenticating user and the users they follow.
       * The home timeline is central to how most users interact with the Twitter service.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/timelines/api-reference/get-statuses-home_timeline
       */
      async homeTimeline(options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("statuses/home_timeline.json", queryParams, { fullResponse: true });
        return new tweet_paginator_v1_1.HomeTimelineV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns the 20 most recent mentions (Tweets containing a users's @screen_name) for the authenticating user.
       * The timeline returned is the equivalent of the one seen when you view your mentions on x.com.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/timelines/api-reference/get-statuses-mentions_timeline
       */
      async mentionTimeline(options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("statuses/mentions_timeline.json", queryParams, { fullResponse: true });
        return new tweet_paginator_v1_1.MentionTimelineV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns a collection of the most recent Tweets posted by the user indicated by the user_id parameters.
       * User timelines belonging to protected users may only be requested when the authenticated user either "owns" the timeline or is an approved follower of the owner.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/timelines/api-reference/get-statuses-user_timeline
       */
      async userTimeline(userId, options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          user_id: userId,
          ...options
        };
        const initialRq = await this.get("statuses/user_timeline.json", queryParams, { fullResponse: true });
        return new tweet_paginator_v1_1.UserTimelineV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns a collection of the most recent Tweets posted by the user indicated by the screen_name parameters.
       * User timelines belonging to protected users may only be requested when the authenticated user either "owns" the timeline or is an approved follower of the owner.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/timelines/api-reference/get-statuses-user_timeline
       */
      async userTimelineByUsername(username, options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          screen_name: username,
          ...options
        };
        const initialRq = await this.get("statuses/user_timeline.json", queryParams, { fullResponse: true });
        return new tweet_paginator_v1_1.UserTimelineV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns the most recent Tweets liked by the authenticating or specified user, 20 tweets by default.
       * Note: favorites are now known as likes.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-favorites-list
       */
      async favoriteTimeline(userId, options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          user_id: userId,
          ...options
        };
        const initialRq = await this.get("favorites/list.json", queryParams, { fullResponse: true });
        return new tweet_paginator_v1_1.UserFavoritesV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns the most recent Tweets liked by the authenticating or specified user, 20 tweets by default.
       * Note: favorites are now known as likes.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/get-favorites-list
       */
      async favoriteTimelineByUsername(username, options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          screen_name: username,
          ...options
        };
        const initialRq = await this.get("favorites/list.json", queryParams, { fullResponse: true });
        return new tweet_paginator_v1_1.UserFavoritesV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /* Users */
      /**
       * Returns a variety of information about the user specified by the required user_id or screen_name parameter.
       * The author's most recent Tweet will be returned inline when possible.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-users-show
       */
      user(user) {
        return this.get("users/show.json", { tweet_mode: "extended", ...user });
      }
      /**
       * Returns fully-hydrated user objects for up to 100 users per request,
       * as specified by comma-separated values passed to the user_id and/or screen_name parameters.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-users-lookup
       */
      users(query) {
        return this.get("users/lookup.json", { tweet_mode: "extended", ...query });
      }
      /**
       * Returns an HTTP 200 OK response code and a representation of the requesting user if authentication was successful;
       * returns a 401 status code and an error message if not.
       * Use this method to test if supplied user credentials are valid.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-verify_credentials
       */
      verifyCredentials(options = {}) {
        return this.get("account/verify_credentials.json", options);
      }
      /**
       * Returns an array of user objects the authenticating user has muted.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/mute-block-report-users/api-reference/get-mutes-users-list
       */
      async listMutedUsers(options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("mutes/users/list.json", queryParams, { fullResponse: true });
        return new mutes_paginator_v1_1.MuteUserListV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns an array of numeric user ids the authenticating user has muted.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/mute-block-report-users/api-reference/get-mutes-users-ids
       */
      async listMutedUserIds(options = {}) {
        const queryParams = {
          stringify_ids: true,
          ...options
        };
        const initialRq = await this.get("mutes/users/ids.json", queryParams, { fullResponse: true });
        return new mutes_paginator_v1_1.MuteUserIdsV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns an array of user objects of friends of the specified user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friends-list
       */
      async userFriendList(options = {}) {
        const queryParams = {
          ...options
        };
        const initialRq = await this.get("friends/list.json", queryParams, { fullResponse: true });
        return new friends_paginator_v1_1.UserFriendListV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns an array of user objects of followers of the specified user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-followers-list
       */
      async userFollowerList(options = {}) {
        const queryParams = {
          ...options
        };
        const initialRq = await this.get("followers/list.json", queryParams, { fullResponse: true });
        return new followers_paginator_v1_1.UserFollowerListV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns an array of numeric user ids of followers of the specified user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-followers-ids
       */
      async userFollowerIds(options = {}) {
        const queryParams = {
          stringify_ids: true,
          ...options
        };
        const initialRq = await this.get("followers/ids.json", queryParams, { fullResponse: true });
        return new followers_paginator_v1_1.UserFollowerIdsV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns an array of numeric user ids of friends of the specified user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friends-ids
       */
      async userFollowingIds(options = {}) {
        const queryParams = {
          stringify_ids: true,
          ...options
        };
        const initialRq = await this.get("friends/ids.json", queryParams, { fullResponse: true });
        return new friends_paginator_v1_1.UserFollowersIdsV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Provides a simple, relevance-based search interface to public user accounts on Twitter.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-users-search
       */
      async searchUsers(query, options = {}) {
        const queryParams = {
          q: query,
          tweet_mode: "extended",
          page: 1,
          ...options
        };
        const initialRq = await this.get("users/search.json", queryParams, { fullResponse: true });
        return new user_paginator_v1_1.UserSearchV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /* Friendship API */
      /**
       * Returns detailed information about the relationship between two arbitrary users.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-show
       */
      friendship(sources) {
        return this.get("friendships/show.json", sources);
      }
      /**
       * Returns the relationships of the authenticating user to the comma-separated list of up to 100 screen_names or user_ids provided.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-lookup
       */
      friendships(friendships) {
        return this.get("friendships/lookup.json", friendships);
      }
      /**
       * Returns a collection of user_ids that the currently authenticated user does not want to receive retweets from.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-no_retweets-ids
       */
      friendshipsNoRetweets() {
        return this.get("friendships/no_retweets/ids.json", { stringify_ids: true });
      }
      /**
       * Returns a collection of numeric IDs for every user who has a pending request to follow the authenticating user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-incoming
       */
      async friendshipsIncoming(options = {}) {
        const queryParams = {
          stringify_ids: true,
          ...options
        };
        const initialRq = await this.get("friendships/incoming.json", queryParams, { fullResponse: true });
        return new user_paginator_v1_1.FriendshipsIncomingV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns a collection of numeric IDs for every protected user for whom the authenticating user has a pending follow request.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friendships-outgoing
       */
      async friendshipsOutgoing(options = {}) {
        const queryParams = {
          stringify_ids: true,
          ...options
        };
        const initialRq = await this.get("friendships/outgoing.json", queryParams, { fullResponse: true });
        return new user_paginator_v1_1.FriendshipsOutgoingV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /* Account/user API */
      /**
       * Get current account settings for authenticating user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-settings
       */
      accountSettings() {
        return this.get("account/settings.json");
      }
      /**
       * Returns a map of the available size variations of the specified user's profile banner.
       * If the user has not uploaded a profile banner, a HTTP 404 will be served instead.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/get-users-profile_banner
       */
      userProfileBannerSizes(params) {
        return this.get("users/profile_banner.json", params);
      }
      /* Lists */
      /**
       * Returns the specified list. Private lists will only be shown if the authenticated user owns the specified list.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-show
       */
      list(options) {
        return this.get("lists/show.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Returns all lists the authenticating or specified user subscribes to, including their own.
       * If no user is given, the authenticating user is used.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-list
       */
      lists(options = {}) {
        return this.get("lists/list.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Returns the members of the specified list. Private list members will only be shown if the authenticated user owns the specified list.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-members
       */
      async listMembers(options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("lists/members.json", queryParams, { fullResponse: true });
        return new list_paginator_v1_1.ListMembersV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Check if the specified user is a member of the specified list.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-members-show
       */
      listGetMember(options) {
        return this.get("lists/members/show.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Returns the lists the specified user has been added to.
       * If user_id or screen_name are not provided, the memberships for the authenticating user are returned.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-memberships
       */
      async listMemberships(options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("lists/memberships.json", queryParams, { fullResponse: true });
        return new list_paginator_v1_1.ListMembershipsV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns the lists owned by the specified Twitter user. Private lists will only be shown if the authenticated user is also the owner of the lists.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-ownerships
       */
      async listOwnerships(options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("lists/ownerships.json", queryParams, { fullResponse: true });
        return new list_paginator_v1_1.ListOwnershipsV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns a timeline of tweets authored by members of the specified list. Retweets are included by default.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-statuses
       */
      async listStatuses(options) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("lists/statuses.json", queryParams, { fullResponse: true });
        return new tweet_paginator_v1_1.ListTimelineV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns the subscribers of the specified list. Private list subscribers will only be shown if the authenticated user owns the specified list.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-subscribers
       */
      async listSubscribers(options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("lists/subscribers.json", queryParams, { fullResponse: true });
        return new list_paginator_v1_1.ListSubscribersV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Check if the specified user is a subscriber of the specified list. Returns the user if they are a subscriber.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-subscribers-show
       */
      listGetSubscriber(options) {
        return this.get("lists/subscribers/show.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Obtain a collection of the lists the specified user is subscribed to, 20 lists per page by default.
       * Does not include the user's own lists.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/get-lists-subscriptions
       */
      async listSubscriptions(options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          ...options
        };
        const initialRq = await this.get("lists/subscriptions.json", queryParams, { fullResponse: true });
        return new list_paginator_v1_1.ListSubscriptionsV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /* Media upload API */
      /**
       * The STATUS command (this method) is used to periodically poll for updates of media processing operation.
       * After the STATUS command response returns succeeded, you can move on to the next step which is usually create Tweet with media_id.
       * https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/get-media-upload-status
       */
      mediaInfo(mediaId) {
        return this.get("media/upload.json", {
          command: "STATUS",
          media_id: mediaId
        }, { prefix: globals_1.API_V1_1_UPLOAD_PREFIX });
      }
      filterStream({ autoConnect, ...params } = {}) {
        const parameters = {};
        for (const [key, value] of Object.entries(params)) {
          if (key === "follow" || key === "track") {
            parameters[key] = value.toString();
          } else if (key === "locations") {
            const locations = value;
            parameters.locations = (0, helpers_1.arrayWrap)(locations).map((loc) => `${loc.lng},${loc.lat}`).join(",");
          } else {
            parameters[key] = value;
          }
        }
        const streamClient = this.stream;
        return streamClient.postStream("statuses/filter.json", parameters, { autoConnect });
      }
      sampleStream({ autoConnect, ...params } = {}) {
        const streamClient = this.stream;
        return streamClient.getStream("statuses/sample.json", params, { autoConnect });
      }
      /**
       * Create a client that is prefixed with `https//stream.x.com` instead of classic API URL.
       */
      get stream() {
        const copiedClient = new client_v1_1.default(this);
        copiedClient.setPrefix(globals_1.API_V1_1_STREAM_PREFIX);
        return copiedClient;
      }
      /* Trends API */
      /**
       * Returns the top 50 trending topics for a specific id, if trending information is available for it.
       * Note: The id parameter for this endpoint is the "where on earth identifier" or WOEID, which is a legacy identifier created by Yahoo and has been deprecated.
       * https://developer.x.com/en/docs/twitter-api/v1/trends/trends-for-location/api-reference/get-trends-place
       */
      trendsByPlace(woeId, options = {}) {
        return this.get("trends/place.json", { id: woeId, ...options });
      }
      /**
       * Returns the locations that Twitter has trending topic information for.
       * The response is an array of "locations" that encode the location's WOEID
       * and some other human-readable information such as a canonical name and country the location belongs in.
       * https://developer.x.com/en/docs/twitter-api/v1/trends/locations-with-trending-topics/api-reference/get-trends-available
       */
      trendsAvailable() {
        return this.get("trends/available.json");
      }
      /**
       * Returns the locations that Twitter has trending topic information for, closest to a specified location.
       * https://developer.x.com/en/docs/twitter-api/v1/trends/locations-with-trending-topics/api-reference/get-trends-closest
       */
      trendsClosest(lat, long) {
        return this.get("trends/closest.json", { lat, long });
      }
      /* Geo API */
      /**
       * Returns all the information about a known place.
       * https://developer.x.com/en/docs/twitter-api/v1/geo/place-information/api-reference/get-geo-id-place_id
       */
      geoPlace(placeId) {
        return this.get("geo/id/:place_id.json", void 0, { params: { place_id: placeId } });
      }
      /**
       * Search for places that can be attached to a Tweet via POST statuses/update.
       * This request will return a list of all the valid places that can be used as the place_id when updating a status.
       * https://developer.x.com/en/docs/twitter-api/v1/geo/places-near-location/api-reference/get-geo-search
       */
      geoSearch(options) {
        return this.get("geo/search.json", options);
      }
      /**
       * Given a latitude and a longitude, searches for up to 20 places that can be used as a place_id when updating a status.
       * This request is an informative call and will deliver generalized results about geography.
       * https://developer.x.com/en/docs/twitter-api/v1/geo/places-near-location/api-reference/get-geo-reverse_geocode
       */
      geoReverseGeoCode(options) {
        return this.get("geo/reverse_geocode.json", options);
      }
      /* Developer utilities */
      /**
       * Returns the current rate limits for methods belonging to the specified resource families.
       * Each API resource belongs to a "resource family" which is indicated in its method documentation.
       * The method's resource family can be determined from the first component of the path after the resource version.
       * https://developer.x.com/en/docs/twitter-api/v1/developer-utilities/rate-limit-status/api-reference/get-application-rate_limit_status
       */
      rateLimitStatuses(...resources) {
        return this.get("application/rate_limit_status.json", { resources });
      }
      /**
       * Returns the list of languages supported by Twitter along with the language code supported by Twitter.
       * https://developer.x.com/en/docs/twitter-api/v1/developer-utilities/supported-languages/api-reference/get-help-languages
       */
      supportedLanguages() {
        return this.get("help/languages.json");
      }
    };
    exports2.default = TwitterApiv1ReadOnly;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v1/media-helpers.v1.js
var require_media_helpers_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v1/media-helpers.v1.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.readNextPartOf = exports2.sleepSecs = exports2.getMediaCategoryByMime = exports2.getMimeType = exports2.getFileSizeFromFileHandle = exports2.getFileHandle = exports2.readFileIntoBuffer = void 0;
    var fs = __importStar(require("fs"));
    var helpers_1 = require_helpers();
    var types_1 = require_types();
    async function readFileIntoBuffer(file) {
      const handle = await getFileHandle(file);
      if (typeof handle === "number") {
        return new Promise((resolve, reject) => {
          fs.readFile(handle, (err, data) => {
            if (err) {
              return reject(err);
            }
            resolve(data);
          });
        });
      } else if (handle instanceof Buffer) {
        return handle;
      } else {
        return handle.readFile();
      }
    }
    exports2.readFileIntoBuffer = readFileIntoBuffer;
    function getFileHandle(file) {
      if (typeof file === "string") {
        return fs.promises.open(file, "r");
      } else if (typeof file === "number") {
        return file;
      } else if (typeof file === "object" && !(file instanceof Buffer)) {
        return file;
      } else if (!(file instanceof Buffer)) {
        throw new Error("Given file is not valid, please check its type.");
      } else {
        return file;
      }
    }
    exports2.getFileHandle = getFileHandle;
    async function getFileSizeFromFileHandle(fileHandle) {
      if (typeof fileHandle === "number") {
        const stats = await new Promise((resolve, reject) => {
          fs.fstat(fileHandle, (err, stats2) => {
            if (err)
              reject(err);
            resolve(stats2);
          });
        });
        return stats.size;
      } else if (fileHandle instanceof Buffer) {
        return fileHandle.length;
      } else {
        return (await fileHandle.stat()).size;
      }
    }
    exports2.getFileSizeFromFileHandle = getFileSizeFromFileHandle;
    function getMimeType(file, type, mimeType) {
      if (typeof mimeType === "string") {
        return mimeType;
      } else if (typeof file === "string" && !type) {
        return getMimeByName(file);
      } else if (typeof type === "string") {
        return getMimeByType(type);
      }
      throw new Error("You must specify type if file is a file handle or Buffer.");
    }
    exports2.getMimeType = getMimeType;
    function getMimeByName(name) {
      if (name.endsWith(".jpeg") || name.endsWith(".jpg"))
        return types_1.EUploadMimeType.Jpeg;
      if (name.endsWith(".png"))
        return types_1.EUploadMimeType.Png;
      if (name.endsWith(".webp"))
        return types_1.EUploadMimeType.Webp;
      if (name.endsWith(".gif"))
        return types_1.EUploadMimeType.Gif;
      if (name.endsWith(".mpeg4") || name.endsWith(".mp4"))
        return types_1.EUploadMimeType.Mp4;
      if (name.endsWith(".mov") || name.endsWith(".mov"))
        return types_1.EUploadMimeType.Mov;
      if (name.endsWith(".srt"))
        return types_1.EUploadMimeType.Srt;
      (0, helpers_1.safeDeprecationWarning)({
        instance: "TwitterApiv1ReadWrite",
        method: "uploadMedia",
        problem: "options.mimeType is missing and filename couldn't help to resolve MIME type, so it will fallback to image/jpeg",
        resolution: "If you except to give filenames without extensions, please specify explicitlty the MIME type using options.mimeType"
      });
      return types_1.EUploadMimeType.Jpeg;
    }
    function getMimeByType(type) {
      (0, helpers_1.safeDeprecationWarning)({
        instance: "TwitterApiv1ReadWrite",
        method: "uploadMedia",
        problem: "you're using options.type",
        resolution: "Remove options.type argument and migrate to options.mimeType which takes the real MIME type. If you're using type=longmp4, add options.longVideo alongside of mimeType=EUploadMimeType.Mp4"
      });
      if (type === "gif")
        return types_1.EUploadMimeType.Gif;
      if (type === "jpg")
        return types_1.EUploadMimeType.Jpeg;
      if (type === "png")
        return types_1.EUploadMimeType.Png;
      if (type === "webp")
        return types_1.EUploadMimeType.Webp;
      if (type === "srt")
        return types_1.EUploadMimeType.Srt;
      if (type === "mp4" || type === "longmp4")
        return types_1.EUploadMimeType.Mp4;
      if (type === "mov")
        return types_1.EUploadMimeType.Mov;
      return type;
    }
    function getMediaCategoryByMime(name, target) {
      if (name === types_1.EUploadMimeType.Mp4 || name === types_1.EUploadMimeType.Mov)
        return target === "tweet" ? "TweetVideo" : "DmVideo";
      if (name === types_1.EUploadMimeType.Gif)
        return target === "tweet" ? "TweetGif" : "DmGif";
      if (name === types_1.EUploadMimeType.Srt)
        return "Subtitles";
      else
        return target === "tweet" ? "TweetImage" : "DmImage";
    }
    exports2.getMediaCategoryByMime = getMediaCategoryByMime;
    function sleepSecs(seconds) {
      return new Promise((resolve) => setTimeout(resolve, seconds * 1e3));
    }
    exports2.sleepSecs = sleepSecs;
    async function readNextPartOf(file, chunkLength, bufferOffset = 0, buffer) {
      if (file instanceof Buffer) {
        const rt = file.slice(bufferOffset, bufferOffset + chunkLength);
        return [rt, rt.length];
      }
      if (!buffer) {
        throw new Error("Well, we will need a buffer to store file content.");
      }
      let bytesRead;
      if (typeof file === "number") {
        bytesRead = await new Promise((resolve, reject) => {
          fs.read(file, buffer, 0, chunkLength, bufferOffset, (err, nread) => {
            if (err)
              reject(err);
            resolve(nread);
          });
        });
      } else {
        const res = await file.read(buffer, 0, chunkLength, bufferOffset);
        bytesRead = res.bytesRead;
      }
      return [buffer, bytesRead];
    }
    exports2.readNextPartOf = readNextPartOf;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v1/client.v1.write.js
var require_client_v1_write = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v1/client.v1.write.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fs = __importStar(require("fs"));
    var globals_1 = require_globals();
    var helpers_1 = require_helpers();
    var types_1 = require_types();
    var client_v1_read_1 = __importDefault(require_client_v1_read());
    var media_helpers_v1_1 = require_media_helpers_v1();
    var UPLOAD_ENDPOINT = "media/upload.json";
    var TwitterApiv1ReadWrite = class extends client_v1_read_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V1_1_PREFIX;
      }
      /**
       * Get a client with only read rights.
       */
      get readOnly() {
        return this;
      }
      /* Tweet API */
      /**
       * Post a new tweet.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
       */
      tweet(status, payload = {}) {
        const queryParams = {
          status,
          tweet_mode: "extended",
          ...payload
        };
        return this.post("statuses/update.json", queryParams);
      }
      /**
       * Quote an existing tweet.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
       */
      async quote(status, quotingStatusId, payload = {}) {
        const url = "https://x.com/i/statuses/" + quotingStatusId;
        return this.tweet(status, { ...payload, attachment_url: url });
      }
      /**
       * Post a series of tweets.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
       */
      async tweetThread(tweets) {
        const postedTweets = [];
        for (const tweet of tweets) {
          const lastTweet = postedTweets.length ? postedTweets[postedTweets.length - 1] : null;
          const queryParams = { ...typeof tweet === "string" ? { status: tweet } : tweet };
          const inReplyToId = lastTweet ? lastTweet.id_str : queryParams.in_reply_to_status_id;
          const status = queryParams.status;
          if (inReplyToId) {
            postedTweets.push(await this.reply(status, inReplyToId, queryParams));
          } else {
            postedTweets.push(await this.tweet(status, queryParams));
          }
        }
        return postedTweets;
      }
      /**
       * Reply to an existing tweet. Shortcut to `.tweet` with tweaked parameters.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
       */
      reply(status, in_reply_to_status_id, payload = {}) {
        return this.tweet(status, {
          auto_populate_reply_metadata: true,
          in_reply_to_status_id,
          ...payload
        });
      }
      /**
       * Delete an existing tweet belonging to you.
       * https://developer.x.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-destroy-id
       */
      deleteTweet(tweetId) {
        return this.post("statuses/destroy/:id.json", { tweet_mode: "extended" }, { params: { id: tweetId } });
      }
      /* User API */
      /**
       * Report the specified user as a spam account to Twitter.
       * Additionally, optionally performs the equivalent of POST blocks/create on behalf of the authenticated user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/mute-block-report-users/api-reference/post-users-report_spam
       */
      reportUserAsSpam(options) {
        return this.post("users/report_spam.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Turn on/off Retweets and device notifications from the specified user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/post-friendships-update
       */
      updateFriendship(options) {
        return this.post("friendships/update.json", options);
      }
      /**
       * Follow the specified user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/post-friendships-create
       */
      createFriendship(options) {
        return this.post("friendships/create.json", options);
      }
      /**
       * Unfollow the specified user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/post-friendships-destroy
       */
      destroyFriendship(options) {
        return this.post("friendships/destroy.json", options);
      }
      /* Account API */
      /**
       * Update current account settings for authenticating user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/get-account-settings
       */
      updateAccountSettings(options) {
        return this.post("account/settings.json", options);
      }
      /**
       * Sets some values that users are able to set under the "Account" tab of their settings page.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile
       */
      updateAccountProfile(options) {
        return this.post("account/update_profile.json", options);
      }
      /**
       * Uploads a profile banner on behalf of the authenticating user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile_banner
       */
      async updateAccountProfileBanner(file, options = {}) {
        const queryParams = {
          banner: await (0, media_helpers_v1_1.readFileIntoBuffer)(file),
          ...options
        };
        return this.post("account/update_profile_banner.json", queryParams, { forceBodyMode: "form-data" });
      }
      /**
       * Updates the authenticating user's profile image.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile_image
       */
      async updateAccountProfileImage(file, options = {}) {
        const queryParams = {
          tweet_mode: "extended",
          image: await (0, media_helpers_v1_1.readFileIntoBuffer)(file),
          ...options
        };
        return this.post("account/update_profile_image.json", queryParams, { forceBodyMode: "form-data" });
      }
      /**
       * Removes the uploaded profile banner for the authenticating user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-remove_profile_banner
       */
      removeAccountProfileBanner() {
        return this.post("account/remove_profile_banner.json");
      }
      /* Lists */
      /**
       * Creates a new list for the authenticated user.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-create
       */
      createList(options) {
        return this.post("lists/create.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Updates the specified list. The authenticated user must own the list to be able to update it.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-update
       */
      updateList(options) {
        return this.post("lists/update.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Deletes the specified list. The authenticated user must own the list to be able to destroy it.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-destroy
       */
      removeList(options) {
        return this.post("lists/destroy.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Adds multiple members to a list, by specifying a comma-separated list of member ids or screen names.
       * If you add a single `user_id` or `screen_name`, it will target `lists/members/create.json`, otherwise
       * it will target `lists/members/create_all.json`.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-members-create_all
       */
      addListMembers(options) {
        const hasMultiple = options.user_id && (0, helpers_1.hasMultipleItems)(options.user_id) || options.screen_name && (0, helpers_1.hasMultipleItems)(options.screen_name);
        const endpoint = hasMultiple ? "lists/members/create_all.json" : "lists/members/create.json";
        return this.post(endpoint, options);
      }
      /**
       * Removes one or more members from a list, by specifying a comma-separated list of member ids or screen names.
       * If you add a single `user_id` or `screen_name`, it will target `lists/members/destroy.json`, otherwise
       * it will target `lists/members/destroy_all.json`.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-members-destroy_all
       */
      removeListMembers(options) {
        const hasMultiple = options.user_id && (0, helpers_1.hasMultipleItems)(options.user_id) || options.screen_name && (0, helpers_1.hasMultipleItems)(options.screen_name);
        const endpoint = hasMultiple ? "lists/members/destroy_all.json" : "lists/members/destroy.json";
        return this.post(endpoint, options);
      }
      /**
       * Subscribes the authenticated user to the specified list.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-subscribers-create
       */
      subscribeToList(options) {
        return this.post("lists/subscribers/create.json", { tweet_mode: "extended", ...options });
      }
      /**
       * Unsubscribes the authenticated user of the specified list.
       * https://developer.x.com/en/docs/twitter-api/v1/accounts-and-users/create-manage-lists/api-reference/post-lists-subscribers-destroy
       */
      unsubscribeOfList(options) {
        return this.post("lists/subscribers/destroy.json", { tweet_mode: "extended", ...options });
      }
      /* Media upload API */
      /**
       * This endpoint can be used to provide additional information about the uploaded media_id.
       * This feature is currently only supported for images and GIFs.
       * https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-metadata-create
       */
      createMediaMetadata(mediaId, metadata) {
        return this.post("media/metadata/create.json", { media_id: mediaId, ...metadata }, { prefix: globals_1.API_V1_1_UPLOAD_PREFIX, forceBodyMode: "json" });
      }
      /**
       * Use this endpoint to associate uploaded subtitles to an uploaded video. You can associate subtitles to video before or after Tweeting.
       * **To obtain subtitle media ID, you must upload each subtitle file separately using `.uploadMedia()` method.**
       *
       * https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-subtitles-create
       */
      createMediaSubtitles(mediaId, subtitles) {
        return this.post("media/subtitles/create.json", { media_id: mediaId, media_category: "TweetVideo", subtitle_info: { subtitles } }, { prefix: globals_1.API_V1_1_UPLOAD_PREFIX, forceBodyMode: "json" });
      }
      /**
       * Use this endpoint to dissociate subtitles from a video and delete the subtitles. You can dissociate subtitles from a video before or after Tweeting.
       * https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-subtitles-delete
       */
      deleteMediaSubtitles(mediaId, ...languages) {
        return this.post("media/subtitles/delete.json", {
          media_id: mediaId,
          media_category: "TweetVideo",
          subtitle_info: { subtitles: languages.map((lang) => ({ language_code: lang })) }
        }, { prefix: globals_1.API_V1_1_UPLOAD_PREFIX, forceBodyMode: "json" });
      }
      async uploadMedia(file, options = {}, returnFullMediaData = false) {
        var _a;
        const chunkLength = (_a = options.chunkLength) !== null && _a !== void 0 ? _a : 1024 * 1024;
        const { fileHandle, mediaCategory, fileSize, mimeType } = await this.getUploadMediaRequirements(file, options);
        try {
          const mediaData = await this.post(UPLOAD_ENDPOINT, {
            command: "INIT",
            total_bytes: fileSize,
            media_type: mimeType,
            media_category: mediaCategory,
            additional_owners: options.additionalOwners,
            shared: options.shared ? true : void 0
          }, { prefix: globals_1.API_V1_1_UPLOAD_PREFIX });
          await this.mediaChunkedUpload(fileHandle, chunkLength, mediaData.media_id_string, options.maxConcurrentUploads);
          const fullMediaData = await this.post(UPLOAD_ENDPOINT, {
            command: "FINALIZE",
            media_id: mediaData.media_id_string
          }, { prefix: globals_1.API_V1_1_UPLOAD_PREFIX });
          if (fullMediaData.processing_info && fullMediaData.processing_info.state !== "succeeded") {
            await this.awaitForMediaProcessingCompletion(fullMediaData);
          }
          if (returnFullMediaData) {
            return fullMediaData;
          } else {
            return fullMediaData.media_id_string;
          }
        } finally {
          if (typeof file === "number") {
            fs.close(file, () => {
            });
          } else if (typeof fileHandle === "object" && !(fileHandle instanceof Buffer)) {
            fileHandle.close();
          }
        }
      }
      async awaitForMediaProcessingCompletion(fullMediaData) {
        var _a;
        while (true) {
          fullMediaData = await this.mediaInfo(fullMediaData.media_id_string);
          const { processing_info } = fullMediaData;
          if (!processing_info || processing_info.state === "succeeded") {
            return;
          }
          if ((_a = processing_info.error) === null || _a === void 0 ? void 0 : _a.code) {
            const { name, message } = processing_info.error;
            throw new Error(`Failed to process media: ${name} - ${message}.`);
          }
          if (processing_info.state === "failed") {
            throw new Error("Failed to process the media.");
          }
          if (processing_info.check_after_secs) {
            await (0, media_helpers_v1_1.sleepSecs)(processing_info.check_after_secs);
          } else {
            await (0, media_helpers_v1_1.sleepSecs)(5);
          }
        }
      }
      async getUploadMediaRequirements(file, { mimeType, type, target, longVideo } = {}) {
        let fileHandle;
        try {
          fileHandle = await (0, media_helpers_v1_1.getFileHandle)(file);
          const realMimeType = (0, media_helpers_v1_1.getMimeType)(file, type, mimeType);
          let mediaCategory;
          if (realMimeType === types_1.EUploadMimeType.Mp4 && (!mimeType && !type && target !== "dm" || longVideo)) {
            mediaCategory = "amplify_video";
          } else {
            mediaCategory = (0, media_helpers_v1_1.getMediaCategoryByMime)(realMimeType, target !== null && target !== void 0 ? target : "tweet");
          }
          return {
            fileHandle,
            mediaCategory,
            fileSize: await (0, media_helpers_v1_1.getFileSizeFromFileHandle)(fileHandle),
            mimeType: realMimeType
          };
        } catch (e) {
          if (typeof file === "number") {
            fs.close(file, () => {
            });
          } else if (typeof fileHandle === "object" && !(fileHandle instanceof Buffer)) {
            fileHandle.close();
          }
          throw e;
        }
      }
      async mediaChunkedUpload(fileHandle, chunkLength, mediaId, maxConcurrentUploads = 3) {
        let chunkIndex = 0;
        if (maxConcurrentUploads < 1) {
          throw new RangeError("Bad maxConcurrentUploads parameter.");
        }
        const buffer = fileHandle instanceof Buffer ? void 0 : Buffer.alloc(chunkLength);
        let readBuffer;
        let nread;
        let offset = 0;
        [readBuffer, nread] = await (0, media_helpers_v1_1.readNextPartOf)(fileHandle, chunkLength, offset, buffer);
        offset += nread;
        const currentUploads = /* @__PURE__ */ new Set();
        while (nread) {
          const mediaBufferPart = readBuffer.slice(0, nread);
          if (mediaBufferPart.length) {
            const request = this.post(UPLOAD_ENDPOINT, {
              command: "APPEND",
              media_id: mediaId,
              segment_index: chunkIndex,
              media: mediaBufferPart
            }, { prefix: globals_1.API_V1_1_UPLOAD_PREFIX });
            currentUploads.add(request);
            request.then(() => {
              currentUploads.delete(request);
            });
            chunkIndex++;
          }
          if (currentUploads.size >= maxConcurrentUploads) {
            await Promise.race(currentUploads);
          }
          [readBuffer, nread] = await (0, media_helpers_v1_1.readNextPartOf)(fileHandle, chunkLength, offset, buffer);
          offset += nread;
        }
        await Promise.all([...currentUploads]);
      }
    };
    exports2.default = TwitterApiv1ReadWrite;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v1/client.v1.js
var require_client_v1 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v1/client.v1.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterApiv1 = void 0;
    var globals_1 = require_globals();
    var dm_paginator_v1_1 = require_dm_paginator_v1();
    var types_1 = require_types();
    var client_v1_write_1 = __importDefault(require_client_v1_write());
    var TwitterApiv1 = class extends client_v1_write_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V1_1_PREFIX;
      }
      /**
       * Get a client with read/write rights.
       */
      get readWrite() {
        return this;
      }
      /* Direct messages */
      // Part: Sending and receiving events
      /**
       * Publishes a new message_create event resulting in a Direct Message sent to a specified user from the authenticating user.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/new-event
       */
      sendDm({ recipient_id, custom_profile_id, ...params }) {
        const args = {
          event: {
            type: types_1.EDirectMessageEventTypeV1.Create,
            [types_1.EDirectMessageEventTypeV1.Create]: {
              target: { recipient_id },
              message_data: params
            }
          }
        };
        if (custom_profile_id) {
          args.event[types_1.EDirectMessageEventTypeV1.Create].custom_profile_id = custom_profile_id;
        }
        return this.post("direct_messages/events/new.json", args, {
          forceBodyMode: "json"
        });
      }
      /**
       * Returns a single Direct Message event by the given id.
       *
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/get-event
       */
      getDmEvent(id) {
        return this.get("direct_messages/events/show.json", { id });
      }
      /**
       * Deletes the direct message specified in the required ID parameter.
       * The authenticating user must be the recipient of the specified direct message.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/delete-message-event
       */
      deleteDm(id) {
        return this.delete("direct_messages/events/destroy.json", { id });
      }
      /**
       * Returns all Direct Message events (both sent and received) within the last 30 days.
       * Sorted in reverse-chronological order.
       *
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/list-events
       */
      async listDmEvents(args = {}) {
        const queryParams = { ...args };
        const initialRq = await this.get("direct_messages/events/list.json", queryParams, { fullResponse: true });
        return new dm_paginator_v1_1.DmEventsV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      // Part: Welcome messages (events)
      /**
       * Creates a new Welcome Message that will be stored and sent in the future from the authenticating user in defined circumstances.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/new-welcome-message
       */
      newWelcomeDm(name, data) {
        const args = {
          [types_1.EDirectMessageEventTypeV1.WelcomeCreate]: {
            name,
            message_data: data
          }
        };
        return this.post("direct_messages/welcome_messages/new.json", args, {
          forceBodyMode: "json"
        });
      }
      /**
       * Returns a Welcome Message by the given id.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/get-welcome-message
       */
      getWelcomeDm(id) {
        return this.get("direct_messages/welcome_messages/show.json", { id });
      }
      /**
       * Deletes a Welcome Message by the given id.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/delete-welcome-message
       */
      deleteWelcomeDm(id) {
        return this.delete("direct_messages/welcome_messages/destroy.json", { id });
      }
      /**
       * Updates a Welcome Message by the given ID.
       * Updates to the welcome_message object are atomic.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/update-welcome-message
       */
      updateWelcomeDm(id, data) {
        const args = { message_data: data };
        return this.put("direct_messages/welcome_messages/update.json", args, {
          forceBodyMode: "json",
          query: { id }
        });
      }
      /**
       * Returns all Direct Message events (both sent and received) within the last 30 days.
       * Sorted in reverse-chronological order.
       *
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/list-events
       */
      async listWelcomeDms(args = {}) {
        const queryParams = { ...args };
        const initialRq = await this.get("direct_messages/welcome_messages/list.json", queryParams, { fullResponse: true });
        return new dm_paginator_v1_1.WelcomeDmV1Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      // Part: Welcome message (rules)
      /**
       * Creates a new Welcome Message Rule that determines which Welcome Message will be shown in a given conversation.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/new-welcome-message-rule
       */
      newWelcomeDmRule(welcomeMessageId) {
        return this.post("direct_messages/welcome_messages/rules/new.json", {
          welcome_message_rule: { welcome_message_id: welcomeMessageId }
        }, {
          forceBodyMode: "json"
        });
      }
      /**
       * Returns a Welcome Message Rule by the given id.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/get-welcome-message-rule
       */
      getWelcomeDmRule(id) {
        return this.get("direct_messages/welcome_messages/rules/show.json", { id });
      }
      /**
       * Deletes a Welcome Message Rule by the given id.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/delete-welcome-message-rule
       */
      deleteWelcomeDmRule(id) {
        return this.delete("direct_messages/welcome_messages/rules/destroy.json", { id });
      }
      /**
       * Retrieves all welcome DM rules for this account.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/welcome-messages/api-reference/list-welcome-message-rules
       */
      async listWelcomeDmRules(args = {}) {
        const queryParams = { ...args };
        return this.get("direct_messages/welcome_messages/rules/list.json", queryParams);
      }
      /**
       * Set the current showed welcome message for logged account ; wrapper for Welcome DM rules.
       * Test if a rule already exists, delete if any, then create a rule for current message ID.
       *
       * If you don't have already a welcome message, create it with `.newWelcomeMessage`.
       */
      async setWelcomeDm(welcomeMessageId, deleteAssociatedWelcomeDmWhenDeletingRule = true) {
        var _a;
        const existingRules = await this.listWelcomeDmRules();
        if ((_a = existingRules.welcome_message_rules) === null || _a === void 0 ? void 0 : _a.length) {
          for (const rule of existingRules.welcome_message_rules) {
            await this.deleteWelcomeDmRule(rule.id);
            if (deleteAssociatedWelcomeDmWhenDeletingRule) {
              await this.deleteWelcomeDm(rule.welcome_message_id);
            }
          }
        }
        return this.newWelcomeDmRule(welcomeMessageId);
      }
      // Part: Read indicator
      /**
       * Marks a message as read in the recipient’s Direct Message conversation view with the sender.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/typing-indicator-and-read-receipts/api-reference/new-read-receipt
       */
      markDmAsRead(lastEventId, recipientId) {
        return this.post("direct_messages/mark_read.json", {
          last_read_event_id: lastEventId,
          recipient_id: recipientId
        }, { forceBodyMode: "url" });
      }
      /**
       * Displays a visual typing indicator in the recipient’s Direct Message conversation view with the sender.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/typing-indicator-and-read-receipts/api-reference/new-typing-indicator
       */
      indicateDmTyping(recipientId) {
        return this.post("direct_messages/indicate_typing.json", {
          recipient_id: recipientId
        }, { forceBodyMode: "url" });
      }
      // Part: Images
      /**
       * Get a single image attached to a direct message. TwitterApi client must be logged with OAuth 1.0a.
       * https://developer.x.com/en/docs/twitter-api/v1/direct-messages/message-attachments/guides/retrieving-media
       */
      async downloadDmImage(urlOrDm) {
        if (typeof urlOrDm !== "string") {
          const attachment = urlOrDm[types_1.EDirectMessageEventTypeV1.Create].message_data.attachment;
          if (!attachment) {
            throw new Error("The given direct message doesn't contain any attachment");
          }
          urlOrDm = attachment.media.media_url_https;
        }
        const data = await this.get(urlOrDm, void 0, { forceParseMode: "buffer", prefix: "" });
        if (!data.length) {
          throw new Error("Image not found. Make sure you are logged with credentials able to access direct messages, and check the URL.");
        }
        return data;
      }
    };
    exports2.TwitterApiv1 = TwitterApiv1;
    exports2.default = TwitterApiv1;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v2/includes.v2.helper.js
var require_includes_v2_helper = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v2/includes.v2.helper.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterV2IncludesHelper = void 0;
    var TwitterV2IncludesHelper = class _TwitterV2IncludesHelper {
      constructor(result) {
        this.result = result;
      }
      /* Tweets */
      get tweets() {
        return _TwitterV2IncludesHelper.tweets(this.result);
      }
      static tweets(result) {
        var _a, _b;
        return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.tweets) !== null && _b !== void 0 ? _b : [];
      }
      tweetById(id) {
        return _TwitterV2IncludesHelper.tweetById(this.result, id);
      }
      static tweetById(result, id) {
        return this.tweets(result).find((tweet) => tweet.id === id);
      }
      /** Retweet associated with the given tweet (*`referenced_tweets.id`*) */
      retweet(tweet) {
        return _TwitterV2IncludesHelper.retweet(this.result, tweet);
      }
      /** Retweet associated with the given tweet (*`referenced_tweets.id`*) */
      static retweet(result, tweet) {
        var _a;
        const retweetIds = ((_a = tweet.referenced_tweets) !== null && _a !== void 0 ? _a : []).filter((ref) => ref.type === "retweeted").map((ref) => ref.id);
        return this.tweets(result).find((t) => retweetIds.includes(t.id));
      }
      /** Quoted tweet associated with the given tweet (*`referenced_tweets.id`*) */
      quote(tweet) {
        return _TwitterV2IncludesHelper.quote(this.result, tweet);
      }
      /** Quoted tweet associated with the given tweet (*`referenced_tweets.id`*) */
      static quote(result, tweet) {
        var _a;
        const quoteIds = ((_a = tweet.referenced_tweets) !== null && _a !== void 0 ? _a : []).filter((ref) => ref.type === "quoted").map((ref) => ref.id);
        return this.tweets(result).find((t) => quoteIds.includes(t.id));
      }
      /** Tweet whose has been answered by the given tweet (*`referenced_tweets.id`*) */
      repliedTo(tweet) {
        return _TwitterV2IncludesHelper.repliedTo(this.result, tweet);
      }
      /** Tweet whose has been answered by the given tweet (*`referenced_tweets.id`*) */
      static repliedTo(result, tweet) {
        var _a;
        const repliesIds = ((_a = tweet.referenced_tweets) !== null && _a !== void 0 ? _a : []).filter((ref) => ref.type === "replied_to").map((ref) => ref.id);
        return this.tweets(result).find((t) => repliesIds.includes(t.id));
      }
      /** Tweet author user object of the given tweet (*`author_id`* or *`referenced_tweets.id.author_id`*) */
      author(tweet) {
        return _TwitterV2IncludesHelper.author(this.result, tweet);
      }
      /** Tweet author user object of the given tweet (*`author_id`* or *`referenced_tweets.id.author_id`*) */
      static author(result, tweet) {
        const authorId = tweet.author_id;
        return authorId ? this.users(result).find((u) => u.id === authorId) : void 0;
      }
      /** Tweet author user object of the tweet answered by the given tweet (*`in_reply_to_user_id`*) */
      repliedToAuthor(tweet) {
        return _TwitterV2IncludesHelper.repliedToAuthor(this.result, tweet);
      }
      /** Tweet author user object of the tweet answered by the given tweet (*`in_reply_to_user_id`*) */
      static repliedToAuthor(result, tweet) {
        const inReplyUserId = tweet.in_reply_to_user_id;
        return inReplyUserId ? this.users(result).find((u) => u.id === inReplyUserId) : void 0;
      }
      /* Users */
      get users() {
        return _TwitterV2IncludesHelper.users(this.result);
      }
      static users(result) {
        var _a, _b;
        return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.users) !== null && _b !== void 0 ? _b : [];
      }
      userById(id) {
        return _TwitterV2IncludesHelper.userById(this.result, id);
      }
      static userById(result, id) {
        return this.users(result).find((u) => u.id === id);
      }
      /** Pinned tweet of the given user (*`pinned_tweet_id`*) */
      pinnedTweet(user) {
        return _TwitterV2IncludesHelper.pinnedTweet(this.result, user);
      }
      /** Pinned tweet of the given user (*`pinned_tweet_id`*) */
      static pinnedTweet(result, user) {
        return user.pinned_tweet_id ? this.tweets(result).find((t) => t.id === user.pinned_tweet_id) : void 0;
      }
      /* Medias */
      get media() {
        return _TwitterV2IncludesHelper.media(this.result);
      }
      static media(result) {
        var _a, _b;
        return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.media) !== null && _b !== void 0 ? _b : [];
      }
      /** Medias associated with the given tweet (*`attachments.media_keys`*) */
      medias(tweet) {
        return _TwitterV2IncludesHelper.medias(this.result, tweet);
      }
      /** Medias associated with the given tweet (*`attachments.media_keys`*) */
      static medias(result, tweet) {
        var _a, _b;
        const keys = (_b = (_a = tweet.attachments) === null || _a === void 0 ? void 0 : _a.media_keys) !== null && _b !== void 0 ? _b : [];
        return this.media(result).filter((m) => keys.includes(m.media_key));
      }
      /* Polls */
      get polls() {
        return _TwitterV2IncludesHelper.polls(this.result);
      }
      static polls(result) {
        var _a, _b;
        return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.polls) !== null && _b !== void 0 ? _b : [];
      }
      /** Poll associated with the given tweet (*`attachments.poll_ids`*) */
      poll(tweet) {
        return _TwitterV2IncludesHelper.poll(this.result, tweet);
      }
      /** Poll associated with the given tweet (*`attachments.poll_ids`*) */
      static poll(result, tweet) {
        var _a, _b;
        const pollIds = (_b = (_a = tweet.attachments) === null || _a === void 0 ? void 0 : _a.poll_ids) !== null && _b !== void 0 ? _b : [];
        if (pollIds.length) {
          const pollId = pollIds[0];
          return this.polls(result).find((p) => p.id === pollId);
        }
        return void 0;
      }
      /* Places */
      get places() {
        return _TwitterV2IncludesHelper.places(this.result);
      }
      static places(result) {
        var _a, _b;
        return (_b = (_a = result.includes) === null || _a === void 0 ? void 0 : _a.places) !== null && _b !== void 0 ? _b : [];
      }
      /** Place associated with the given tweet (*`geo.place_id`*) */
      place(tweet) {
        return _TwitterV2IncludesHelper.place(this.result, tweet);
      }
      /** Place associated with the given tweet (*`geo.place_id`*) */
      static place(result, tweet) {
        var _a;
        const placeId = (_a = tweet.geo) === null || _a === void 0 ? void 0 : _a.place_id;
        return placeId ? this.places(result).find((p) => p.id === placeId) : void 0;
      }
      /* Lists */
      /** List owner of the given list (*`owner_id`*) */
      listOwner(list) {
        return _TwitterV2IncludesHelper.listOwner(this.result, list);
      }
      /** List owner of the given list (*`owner_id`*) */
      static listOwner(result, list) {
        const creatorId = list.owner_id;
        return creatorId ? this.users(result).find((p) => p.id === creatorId) : void 0;
      }
      /* Spaces */
      /** Creator of the given space (*`creator_id`*) */
      spaceCreator(space) {
        return _TwitterV2IncludesHelper.spaceCreator(this.result, space);
      }
      /** Creator of the given space (*`creator_id`*) */
      static spaceCreator(result, space) {
        const creatorId = space.creator_id;
        return creatorId ? this.users(result).find((p) => p.id === creatorId) : void 0;
      }
      /** Current hosts of the given space (*`host_ids`*) */
      spaceHosts(space) {
        return _TwitterV2IncludesHelper.spaceHosts(this.result, space);
      }
      /** Current hosts of the given space (*`host_ids`*) */
      static spaceHosts(result, space) {
        var _a;
        const hostIds = (_a = space.host_ids) !== null && _a !== void 0 ? _a : [];
        return this.users(result).filter((u) => hostIds.includes(u.id));
      }
      /** Current speakers of the given space (*`speaker_ids`*) */
      spaceSpeakers(space) {
        return _TwitterV2IncludesHelper.spaceSpeakers(this.result, space);
      }
      /** Current speakers of the given space (*`speaker_ids`*) */
      static spaceSpeakers(result, space) {
        var _a;
        const speakerIds = (_a = space.speaker_ids) !== null && _a !== void 0 ? _a : [];
        return this.users(result).filter((u) => speakerIds.includes(u.id));
      }
      /** Current invited users of the given space (*`invited_user_ids`*) */
      spaceInvitedUsers(space) {
        return _TwitterV2IncludesHelper.spaceInvitedUsers(this.result, space);
      }
      /** Current invited users of the given space (*`invited_user_ids`*) */
      static spaceInvitedUsers(result, space) {
        var _a;
        const invitedUserIds = (_a = space.invited_user_ids) !== null && _a !== void 0 ? _a : [];
        return this.users(result).filter((u) => invitedUserIds.includes(u.id));
      }
    };
    exports2.TwitterV2IncludesHelper = TwitterV2IncludesHelper;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/v2.paginator.js
var require_v2_paginator = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/v2.paginator.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TimelineV2Paginator = exports2.TwitterV2Paginator = void 0;
    var includes_v2_helper_1 = require_includes_v2_helper();
    var TwitterPaginator_1 = require_TwitterPaginator();
    var TwitterV2Paginator = class extends TwitterPaginator_1.PreviousableTwitterPaginator {
      updateIncludes(data) {
        if (data.errors) {
          if (!this._realData.errors) {
            this._realData.errors = [];
          }
          this._realData.errors = [...this._realData.errors, ...data.errors];
        }
        if (!data.includes) {
          return;
        }
        if (!this._realData.includes) {
          this._realData.includes = {};
        }
        const includesRealData = this._realData.includes;
        for (const [includeKey, includeArray] of Object.entries(data.includes)) {
          if (!includesRealData[includeKey]) {
            includesRealData[includeKey] = [];
          }
          includesRealData[includeKey] = [
            ...includesRealData[includeKey],
            ...includeArray
          ];
        }
      }
      /** Throw if the current paginator is not usable. */
      assertUsable() {
        if (this.unusable) {
          throw new Error("Unable to use this paginator to fetch more data, as it does not contain any metadata. Check .errors property for more details.");
        }
      }
      get meta() {
        return this._realData.meta;
      }
      get includes() {
        var _a;
        if (!((_a = this._realData) === null || _a === void 0 ? void 0 : _a.includes)) {
          return new includes_v2_helper_1.TwitterV2IncludesHelper(this._realData);
        }
        if (this._includesInstance) {
          return this._includesInstance;
        }
        return this._includesInstance = new includes_v2_helper_1.TwitterV2IncludesHelper(this._realData);
      }
      get errors() {
        var _a;
        return (_a = this._realData.errors) !== null && _a !== void 0 ? _a : [];
      }
      /** `true` if this paginator only contains error payload and no metadata found to consume data. */
      get unusable() {
        return this.errors.length > 0 && !this._realData.meta && !this._realData.data;
      }
    };
    exports2.TwitterV2Paginator = TwitterV2Paginator;
    var TimelineV2Paginator = class extends TwitterV2Paginator {
      refreshInstanceFromResult(response, isNextPage) {
        var _a;
        const result = response.data;
        const resultData = (_a = result.data) !== null && _a !== void 0 ? _a : [];
        this._rateLimit = response.rateLimit;
        if (!this._realData.data) {
          this._realData.data = [];
        }
        if (isNextPage) {
          this._realData.meta.result_count += result.meta.result_count;
          this._realData.meta.next_token = result.meta.next_token;
          this._realData.data.push(...resultData);
        } else {
          this._realData.meta.result_count += result.meta.result_count;
          this._realData.meta.previous_token = result.meta.previous_token;
          this._realData.data.unshift(...resultData);
        }
        this.updateIncludes(result);
      }
      getNextQueryParams(maxResults) {
        this.assertUsable();
        return {
          ...this.injectQueryParams(maxResults),
          pagination_token: this._realData.meta.next_token
        };
      }
      getPreviousQueryParams(maxResults) {
        this.assertUsable();
        return {
          ...this.injectQueryParams(maxResults),
          pagination_token: this._realData.meta.previous_token
        };
      }
      getPageLengthFromRequest(result) {
        var _a, _b;
        return (_b = (_a = result.data.data) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
      }
      isFetchLastOver(result) {
        var _a;
        return !((_a = result.data.data) === null || _a === void 0 ? void 0 : _a.length) || !this.canFetchNextPage(result.data);
      }
      canFetchNextPage(result) {
        var _a;
        return !!((_a = result.meta) === null || _a === void 0 ? void 0 : _a.next_token);
      }
    };
    exports2.TimelineV2Paginator = TimelineV2Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/tweet.paginator.v2.js
var require_tweet_paginator_v2 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/tweet.paginator.v2.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TweetV2ListTweetsPaginator = exports2.TweetV2UserLikedTweetsPaginator = exports2.TweetBookmarksTimelineV2Paginator = exports2.TweetUserMentionTimelineV2Paginator = exports2.TweetUserTimelineV2Paginator = exports2.TweetHomeTimelineV2Paginator = exports2.QuotedTweetsTimelineV2Paginator = exports2.TweetSearchAllV2Paginator = exports2.TweetSearchRecentV2Paginator = void 0;
    var v2_paginator_1 = require_v2_paginator();
    var TweetTimelineV2Paginator = class extends v2_paginator_1.TwitterV2Paginator {
      refreshInstanceFromResult(response, isNextPage) {
        var _a;
        const result = response.data;
        const resultData = (_a = result.data) !== null && _a !== void 0 ? _a : [];
        this._rateLimit = response.rateLimit;
        if (!this._realData.data) {
          this._realData.data = [];
        }
        if (isNextPage) {
          this._realData.meta.oldest_id = result.meta.oldest_id;
          this._realData.meta.result_count += result.meta.result_count;
          this._realData.meta.next_token = result.meta.next_token;
          this._realData.data.push(...resultData);
        } else {
          this._realData.meta.newest_id = result.meta.newest_id;
          this._realData.meta.result_count += result.meta.result_count;
          this._realData.data.unshift(...resultData);
        }
        this.updateIncludes(result);
      }
      getNextQueryParams(maxResults) {
        this.assertUsable();
        const params = { ...this.injectQueryParams(maxResults) };
        if (this._realData.meta.next_token) {
          params.next_token = this._realData.meta.next_token;
        } else {
          if (params.start_time) {
            params.since_id = this.dateStringToSnowflakeId(params.start_time);
            delete params.start_time;
          }
          if (params.end_time) {
            delete params.end_time;
          }
          params.until_id = this._realData.meta.oldest_id;
        }
        return params;
      }
      getPreviousQueryParams(maxResults) {
        this.assertUsable();
        return {
          ...this.injectQueryParams(maxResults),
          since_id: this._realData.meta.newest_id
        };
      }
      getPageLengthFromRequest(result) {
        var _a, _b;
        return (_b = (_a = result.data.data) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
      }
      isFetchLastOver(result) {
        var _a;
        return !((_a = result.data.data) === null || _a === void 0 ? void 0 : _a.length) || !this.canFetchNextPage(result.data);
      }
      canFetchNextPage(result) {
        return !!result.meta.next_token;
      }
      getItemArray() {
        return this.tweets;
      }
      dateStringToSnowflakeId(dateStr) {
        const TWITTER_START_EPOCH = BigInt("1288834974657");
        const date = new Date(dateStr);
        if (isNaN(date.valueOf())) {
          throw new Error("Unable to convert start_time/end_time to a valid date. A ISO 8601 DateTime is excepted, please check your input.");
        }
        const dateTimestamp = BigInt(date.valueOf());
        return (dateTimestamp - TWITTER_START_EPOCH << BigInt("22")).toString();
      }
      /**
       * Tweets returned by paginator.
       */
      get tweets() {
        var _a;
        return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
      }
      get meta() {
        return super.meta;
      }
    };
    var TweetPaginableTimelineV2Paginator = class extends v2_paginator_1.TimelineV2Paginator {
      refreshInstanceFromResult(response, isNextPage) {
        super.refreshInstanceFromResult(response, isNextPage);
        const result = response.data;
        if (isNextPage) {
          this._realData.meta.oldest_id = result.meta.oldest_id;
        } else {
          this._realData.meta.newest_id = result.meta.newest_id;
        }
      }
      getItemArray() {
        return this.tweets;
      }
      /**
       * Tweets returned by paginator.
       */
      get tweets() {
        var _a;
        return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
      }
      get meta() {
        return super.meta;
      }
    };
    var TweetSearchRecentV2Paginator = class extends TweetTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "tweets/search/recent";
      }
    };
    exports2.TweetSearchRecentV2Paginator = TweetSearchRecentV2Paginator;
    var TweetSearchAllV2Paginator = class extends TweetTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "tweets/search/all";
      }
    };
    exports2.TweetSearchAllV2Paginator = TweetSearchAllV2Paginator;
    var QuotedTweetsTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "tweets/:id/quote_tweets";
      }
    };
    exports2.QuotedTweetsTimelineV2Paginator = QuotedTweetsTimelineV2Paginator;
    var TweetHomeTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/timelines/reverse_chronological";
      }
    };
    exports2.TweetHomeTimelineV2Paginator = TweetHomeTimelineV2Paginator;
    var TweetUserTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/tweets";
      }
    };
    exports2.TweetUserTimelineV2Paginator = TweetUserTimelineV2Paginator;
    var TweetUserMentionTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/mentions";
      }
    };
    exports2.TweetUserMentionTimelineV2Paginator = TweetUserMentionTimelineV2Paginator;
    var TweetBookmarksTimelineV2Paginator = class extends TweetPaginableTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/bookmarks";
      }
    };
    exports2.TweetBookmarksTimelineV2Paginator = TweetBookmarksTimelineV2Paginator;
    var TweetListV2Paginator = class extends v2_paginator_1.TimelineV2Paginator {
      /**
       * Tweets returned by paginator.
       */
      get tweets() {
        var _a;
        return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
      }
      get meta() {
        return super.meta;
      }
      getItemArray() {
        return this.tweets;
      }
    };
    var TweetV2UserLikedTweetsPaginator = class extends TweetListV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/liked_tweets";
      }
    };
    exports2.TweetV2UserLikedTweetsPaginator = TweetV2UserLikedTweetsPaginator;
    var TweetV2ListTweetsPaginator = class extends TweetListV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/:id/tweets";
      }
    };
    exports2.TweetV2ListTweetsPaginator = TweetV2ListTweetsPaginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/user.paginator.v2.js
var require_user_paginator_v2 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/user.paginator.v2.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TweetRetweetersUsersV2Paginator = exports2.TweetLikingUsersV2Paginator = exports2.UserListFollowersV2Paginator = exports2.UserListMembersV2Paginator = exports2.UserFollowingV2Paginator = exports2.UserFollowersV2Paginator = exports2.UserMutingUsersV2Paginator = exports2.UserBlockingUsersV2Paginator = void 0;
    var v2_paginator_1 = require_v2_paginator();
    var UserTimelineV2Paginator = class extends v2_paginator_1.TimelineV2Paginator {
      getItemArray() {
        return this.users;
      }
      /**
       * Users returned by paginator.
       */
      get users() {
        var _a;
        return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
      }
      get meta() {
        return super.meta;
      }
    };
    var UserBlockingUsersV2Paginator = class extends UserTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/blocking";
      }
    };
    exports2.UserBlockingUsersV2Paginator = UserBlockingUsersV2Paginator;
    var UserMutingUsersV2Paginator = class extends UserTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/muting";
      }
    };
    exports2.UserMutingUsersV2Paginator = UserMutingUsersV2Paginator;
    var UserFollowersV2Paginator = class extends UserTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/followers";
      }
    };
    exports2.UserFollowersV2Paginator = UserFollowersV2Paginator;
    var UserFollowingV2Paginator = class extends UserTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/following";
      }
    };
    exports2.UserFollowingV2Paginator = UserFollowingV2Paginator;
    var UserListMembersV2Paginator = class extends UserTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/:id/members";
      }
    };
    exports2.UserListMembersV2Paginator = UserListMembersV2Paginator;
    var UserListFollowersV2Paginator = class extends UserTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "lists/:id/followers";
      }
    };
    exports2.UserListFollowersV2Paginator = UserListFollowersV2Paginator;
    var TweetLikingUsersV2Paginator = class extends UserTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "tweets/:id/liking_users";
      }
    };
    exports2.TweetLikingUsersV2Paginator = TweetLikingUsersV2Paginator;
    var TweetRetweetersUsersV2Paginator = class extends UserTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "tweets/:id/retweeted_by";
      }
    };
    exports2.TweetRetweetersUsersV2Paginator = TweetRetweetersUsersV2Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/list.paginator.v2.js
var require_list_paginator_v2 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/list.paginator.v2.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.UserListFollowedV2Paginator = exports2.UserListMembershipsV2Paginator = exports2.UserOwnedListsV2Paginator = void 0;
    var v2_paginator_1 = require_v2_paginator();
    var ListTimelineV2Paginator = class extends v2_paginator_1.TimelineV2Paginator {
      getItemArray() {
        return this.lists;
      }
      /**
       * Lists returned by paginator.
       */
      get lists() {
        var _a;
        return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
      }
      get meta() {
        return super.meta;
      }
    };
    var UserOwnedListsV2Paginator = class extends ListTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/owned_lists";
      }
    };
    exports2.UserOwnedListsV2Paginator = UserOwnedListsV2Paginator;
    var UserListMembershipsV2Paginator = class extends ListTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/list_memberships";
      }
    };
    exports2.UserListMembershipsV2Paginator = UserListMembershipsV2Paginator;
    var UserListFollowedV2Paginator = class extends ListTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "users/:id/followed_lists";
      }
    };
    exports2.UserListFollowedV2Paginator = UserListFollowedV2Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/index.js
var require_paginators = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    __exportStar(require_tweet_paginator_v2(), exports2);
    __exportStar(require_TwitterPaginator(), exports2);
    __exportStar(require_dm_paginator_v1(), exports2);
    __exportStar(require_mutes_paginator_v1(), exports2);
    __exportStar(require_tweet_paginator_v1(), exports2);
    __exportStar(require_user_paginator_v1(), exports2);
    __exportStar(require_user_paginator_v2(), exports2);
    __exportStar(require_list_paginator_v1(), exports2);
    __exportStar(require_list_paginator_v2(), exports2);
    __exportStar(require_friends_paginator_v1(), exports2);
    __exportStar(require_followers_paginator_v1(), exports2);
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v2-labs/client.v2.labs.read.js
var require_client_v2_labs_read = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v2-labs/client.v2.labs.read.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var client_subclient_1 = __importDefault(require_client_subclient());
    var globals_1 = require_globals();
    var TwitterApiv2LabsReadOnly = class extends client_subclient_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V2_LABS_PREFIX;
      }
    };
    exports2.default = TwitterApiv2LabsReadOnly;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/paginators/dm.paginator.v2.js
var require_dm_paginator_v2 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/paginators/dm.paginator.v2.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ConversationDMTimelineV2Paginator = exports2.OneToOneDMTimelineV2Paginator = exports2.FullDMTimelineV2Paginator = exports2.DMTimelineV2Paginator = void 0;
    var v2_paginator_1 = require_v2_paginator();
    var DMTimelineV2Paginator = class extends v2_paginator_1.TimelineV2Paginator {
      getItemArray() {
        return this.events;
      }
      /**
       * Events returned by paginator.
       */
      get events() {
        var _a;
        return (_a = this._realData.data) !== null && _a !== void 0 ? _a : [];
      }
      get meta() {
        return super.meta;
      }
    };
    exports2.DMTimelineV2Paginator = DMTimelineV2Paginator;
    var FullDMTimelineV2Paginator = class extends DMTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "dm_events";
      }
    };
    exports2.FullDMTimelineV2Paginator = FullDMTimelineV2Paginator;
    var OneToOneDMTimelineV2Paginator = class extends DMTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "dm_conversations/with/:participant_id/dm_events";
      }
    };
    exports2.OneToOneDMTimelineV2Paginator = OneToOneDMTimelineV2Paginator;
    var ConversationDMTimelineV2Paginator = class extends DMTimelineV2Paginator {
      constructor() {
        super(...arguments);
        this._endpoint = "dm_conversations/:dm_conversation_id/dm_events";
      }
    };
    exports2.ConversationDMTimelineV2Paginator = ConversationDMTimelineV2Paginator;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v2/client.v2.read.js
var require_client_v2_read = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v2/client.v2.read.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var client_subclient_1 = __importDefault(require_client_subclient());
    var globals_1 = require_globals();
    var paginators_1 = require_paginators();
    var client_v2_labs_read_1 = __importDefault(require_client_v2_labs_read());
    var user_paginator_v2_1 = require_user_paginator_v2();
    var helpers_1 = require_helpers();
    var dm_paginator_v2_1 = require_dm_paginator_v2();
    var TwitterApiv2ReadOnly = class extends client_subclient_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V2_PREFIX;
      }
      /* Sub-clients */
      /**
       * Get a client for v2 labs endpoints.
       */
      get labs() {
        if (this._labs)
          return this._labs;
        return this._labs = new client_v2_labs_read_1.default(this);
      }
      async search(queryOrOptions, options = {}) {
        const queryParams = typeof queryOrOptions === "string" ? { ...options, query: queryOrOptions } : { ...queryOrOptions };
        const initialRq = await this.get("tweets/search/recent", queryParams, { fullResponse: true });
        return new paginators_1.TweetSearchRecentV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * The full-archive search endpoint returns the complete history of public Tweets matching a search query;
       * since the first Tweet was created March 26, 2006.
       *
       * This endpoint is only available to those users who have been approved for the Academic Research product track.
       * https://developer.x.com/en/docs/twitter-api/tweets/search/api-reference/get-tweets-search-all
       */
      async searchAll(query, options = {}) {
        const queryParams = { ...options, query };
        const initialRq = await this.get("tweets/search/all", queryParams, { fullResponse: true });
        return new paginators_1.TweetSearchAllV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams
        });
      }
      /**
       * Returns a variety of information about a single Tweet specified by the requested ID.
       * https://developer.x.com/en/docs/twitter-api/tweets/lookup/api-reference/get-tweets-id
       *
       * OAuth2 scope: `users.read`, `tweet.read`
       */
      singleTweet(tweetId, options = {}) {
        return this.get("tweets/:id", options, { params: { id: tweetId } });
      }
      /**
       * Returns a variety of information about tweets specified by list of IDs.
       * https://developer.x.com/en/docs/twitter-api/tweets/lookup/api-reference/get-tweets
       *
       * OAuth2 scope: `users.read`, `tweet.read`
       */
      tweets(tweetIds, options = {}) {
        return this.get("tweets", { ids: tweetIds, ...options });
      }
      /**
       * The recent Tweet counts endpoint returns count of Tweets from the last seven days that match a search query.
       * OAuth2 Bearer auth only.
       * https://developer.x.com/en/docs/twitter-api/tweets/counts/api-reference/get-tweets-counts-recent
       */
      tweetCountRecent(query, options = {}) {
        return this.get("tweets/counts/recent", { query, ...options });
      }
      /**
       * This endpoint is only available to those users who have been approved for the Academic Research product track.
       * The full-archive search endpoint returns the complete history of public Tweets matching a search query;
       * since the first Tweet was created March 26, 2006.
       * OAuth2 Bearer auth only.
       * **This endpoint has pagination, yet it is not supported by bundled paginators. Use `next_token` to fetch next page.**
       * https://developer.x.com/en/docs/twitter-api/tweets/counts/api-reference/get-tweets-counts-all
       */
      tweetCountAll(query, options = {}) {
        return this.get("tweets/counts/all", { query, ...options });
      }
      async tweetRetweetedBy(tweetId, options = {}) {
        const { asPaginator, ...parameters } = options;
        const initialRq = await this.get("tweets/:id/retweeted_by", parameters, {
          fullResponse: true,
          params: { id: tweetId }
        });
        if (!asPaginator) {
          return initialRq.data;
        }
        return new user_paginator_v2_1.TweetRetweetersUsersV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: parameters,
          sharedParams: { id: tweetId }
        });
      }
      async tweetLikedBy(tweetId, options = {}) {
        const { asPaginator, ...parameters } = options;
        const initialRq = await this.get("tweets/:id/liking_users", parameters, {
          fullResponse: true,
          params: { id: tweetId }
        });
        if (!asPaginator) {
          return initialRq.data;
        }
        return new user_paginator_v2_1.TweetLikingUsersV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: parameters,
          sharedParams: { id: tweetId }
        });
      }
      /**
       * Allows you to retrieve a collection of the most recent Tweets and Retweets posted by you and users you follow, also known as home timeline.
       * This endpoint returns up to the last 3200 Tweets.
       * https://developer.x.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-reverse-chronological
       *
       * OAuth 2 scopes: `tweet.read` `users.read`
       */
      async homeTimeline(options = {}) {
        const meUser = await this.getCurrentUserV2Object();
        const initialRq = await this.get("users/:id/timelines/reverse_chronological", options, {
          fullResponse: true,
          params: { id: meUser.data.id }
        });
        return new paginators_1.TweetHomeTimelineV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: options,
          sharedParams: { id: meUser.data.id }
        });
      }
      /**
       * Returns Tweets composed by a single user, specified by the requested user ID.
       * By default, the most recent ten Tweets are returned per request.
       * Using pagination, the most recent 3,200 Tweets can be retrieved.
       * https://developer.x.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets
       */
      async userTimeline(userId, options = {}) {
        const initialRq = await this.get("users/:id/tweets", options, {
          fullResponse: true,
          params: { id: userId }
        });
        return new paginators_1.TweetUserTimelineV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: options,
          sharedParams: { id: userId }
        });
      }
      /**
       * Returns Tweets mentioning a single user specified by the requested user ID.
       * By default, the most recent ten Tweets are returned per request.
       * Using pagination, up to the most recent 800 Tweets can be retrieved.
       * https://developer.x.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-mentions
       */
      async userMentionTimeline(userId, options = {}) {
        const initialRq = await this.get("users/:id/mentions", options, {
          fullResponse: true,
          params: { id: userId }
        });
        return new paginators_1.TweetUserMentionTimelineV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: options,
          sharedParams: { id: userId }
        });
      }
      /**
       * Returns Quote Tweets for a Tweet specified by the requested Tweet ID.
       * https://developer.x.com/en/docs/twitter-api/tweets/quote-tweets/api-reference/get-tweets-id-quote_tweets
       *
       * OAuth2 scopes: `users.read` `tweet.read`
       */
      async quotes(tweetId, options = {}) {
        const initialRq = await this.get("tweets/:id/quote_tweets", options, {
          fullResponse: true,
          params: { id: tweetId }
        });
        return new paginators_1.QuotedTweetsTimelineV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: options,
          sharedParams: { id: tweetId }
        });
      }
      /* Bookmarks */
      /**
       * Allows you to get information about a authenticated user’s 800 most recent bookmarked Tweets.
       * https://developer.x.com/en/docs/twitter-api/tweets/bookmarks/api-reference/get-users-id-bookmarks
       *
       * OAuth2 scopes: `users.read` `tweet.read` `bookmark.read`
       */
      async bookmarks(options = {}) {
        const user = await this.getCurrentUserV2Object();
        const initialRq = await this.get("users/:id/bookmarks", options, {
          fullResponse: true,
          params: { id: user.data.id }
        });
        return new paginators_1.TweetBookmarksTimelineV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: options,
          sharedParams: { id: user.data.id }
        });
      }
      /* Users */
      /**
       * Returns information about an authorized user.
       * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-me
       *
       * OAuth2 scopes: `tweet.read` & `users.read`
       */
      me(options = {}) {
        return this.get("users/me", options);
      }
      /**
       * Returns a variety of information about a single user specified by the requested ID.
       * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-id
       */
      user(userId, options = {}) {
        return this.get("users/:id", options, { params: { id: userId } });
      }
      /**
       * Returns a variety of information about one or more users specified by the requested IDs.
       * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users
       */
      users(userIds, options = {}) {
        const ids = Array.isArray(userIds) ? userIds.join(",") : userIds;
        return this.get("users", { ...options, ids });
      }
      /**
       * Returns a variety of information about a single user specified by their username.
       * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
       */
      userByUsername(username, options = {}) {
        return this.get("users/by/username/:username", options, { params: { username } });
      }
      /**
       * Returns a variety of information about one or more users specified by their usernames.
       * https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by
       *
       * OAuth2 scope: `users.read`, `tweet.read`
       */
      usersByUsernames(usernames, options = {}) {
        usernames = Array.isArray(usernames) ? usernames.join(",") : usernames;
        return this.get("users/by", { ...options, usernames });
      }
      async followers(userId, options = {}) {
        const { asPaginator, ...parameters } = options;
        const params = { id: userId };
        if (!asPaginator) {
          return this.get("users/:id/followers", parameters, { params });
        }
        const initialRq = await this.get("users/:id/followers", parameters, { fullResponse: true, params });
        return new user_paginator_v2_1.UserFollowersV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: parameters,
          sharedParams: params
        });
      }
      async following(userId, options = {}) {
        const { asPaginator, ...parameters } = options;
        const params = { id: userId };
        if (!asPaginator) {
          return this.get("users/:id/following", parameters, { params });
        }
        const initialRq = await this.get("users/:id/following", parameters, { fullResponse: true, params });
        return new user_paginator_v2_1.UserFollowingV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: parameters,
          sharedParams: params
        });
      }
      /**
       * Allows you to get information about a user’s liked Tweets.
       * https://developer.x.com/en/docs/twitter-api/tweets/likes/api-reference/get-users-id-liked_tweets
       */
      async userLikedTweets(userId, options = {}) {
        const params = { id: userId };
        const initialRq = await this.get("users/:id/liked_tweets", options, { fullResponse: true, params });
        return new paginators_1.TweetV2UserLikedTweetsPaginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /**
       * Returns a list of users who are blocked by the authenticating user.
       * https://developer.x.com/en/docs/twitter-api/users/blocks/api-reference/get-users-blocking
       */
      async userBlockingUsers(userId, options = {}) {
        const params = { id: userId };
        const initialRq = await this.get("users/:id/blocking", options, { fullResponse: true, params });
        return new user_paginator_v2_1.UserBlockingUsersV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /**
       * Returns a list of users who are muted by the authenticating user.
       * https://developer.x.com/en/docs/twitter-api/users/mutes/api-reference/get-users-muting
       */
      async userMutingUsers(userId, options = {}) {
        const params = { id: userId };
        const initialRq = await this.get("users/:id/muting", options, { fullResponse: true, params });
        return new user_paginator_v2_1.UserMutingUsersV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /* Lists */
      /**
       * Returns the details of a specified List.
       * https://developer.x.com/en/docs/twitter-api/lists/list-lookup/api-reference/get-lists-id
       */
      list(id, options = {}) {
        return this.get("lists/:id", options, { params: { id } });
      }
      /**
       * Returns all Lists owned by the specified user.
       * https://developer.x.com/en/docs/twitter-api/lists/list-lookup/api-reference/get-users-id-owned_lists
       */
      async listsOwned(userId, options = {}) {
        const params = { id: userId };
        const initialRq = await this.get("users/:id/owned_lists", options, { fullResponse: true, params });
        return new paginators_1.UserOwnedListsV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /**
       * Returns all Lists a specified user is a member of.
       * https://developer.x.com/en/docs/twitter-api/lists/list-members/api-reference/get-users-id-list_memberships
       */
      async listMemberships(userId, options = {}) {
        const params = { id: userId };
        const initialRq = await this.get("users/:id/list_memberships", options, { fullResponse: true, params });
        return new paginators_1.UserListMembershipsV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /**
       * Returns all Lists a specified user follows.
       * https://developer.x.com/en/docs/twitter-api/lists/list-follows/api-reference/get-users-id-followed_lists
       */
      async listFollowed(userId, options = {}) {
        const params = { id: userId };
        const initialRq = await this.get("users/:id/followed_lists", options, { fullResponse: true, params });
        return new paginators_1.UserListFollowedV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /**
       * Returns a list of Tweets from the specified List.
       * https://developer.x.com/en/docs/twitter-api/lists/list-tweets/api-reference/get-lists-id-tweets
       */
      async listTweets(listId, options = {}) {
        const params = { id: listId };
        const initialRq = await this.get("lists/:id/tweets", options, { fullResponse: true, params });
        return new paginators_1.TweetV2ListTweetsPaginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /**
       * Returns a list of users who are members of the specified List.
       * https://developer.x.com/en/docs/twitter-api/lists/list-members/api-reference/get-lists-id-members
       */
      async listMembers(listId, options = {}) {
        const params = { id: listId };
        const initialRq = await this.get("lists/:id/members", options, { fullResponse: true, params });
        return new user_paginator_v2_1.UserListMembersV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /**
       * Returns a list of users who are followers of the specified List.
       * https://developer.x.com/en/docs/twitter-api/lists/list-follows/api-reference/get-lists-id-followers
       */
      async listFollowers(listId, options = {}) {
        const params = { id: listId };
        const initialRq = await this.get("lists/:id/followers", options, { fullResponse: true, params });
        return new user_paginator_v2_1.UserListFollowersV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /* Direct messages */
      /**
       * Returns a list of Direct Messages for the authenticated user, both sent and received.
       * Direct Message events are returned in reverse chronological order.
       * Supports retrieving events from the previous 30 days.
       *
       * OAuth 2 scopes: `dm.read`, `tweet.read`, `user.read`
       *
       * https://developer.x.com/en/docs/twitter-api/direct-messages/lookup/api-reference/get-dm_events
       */
      async listDmEvents(options = {}) {
        const initialRq = await this.get("dm_events", options, { fullResponse: true });
        return new dm_paginator_v2_1.FullDMTimelineV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options }
        });
      }
      /**
       * Returns a list of Direct Messages (DM) events within a 1-1 conversation with the user specified in the participant_id path parameter.
       * Messages are returned in reverse chronological order.
       *
       * OAuth 2 scopes: `dm.read`, `tweet.read`, `user.read`
       *
       * https://developer.x.com/en/docs/twitter-api/direct-messages/lookup/api-reference/get-dm_conversations-dm_conversation_id-dm_events
       */
      async listDmEventsWithParticipant(participantId, options = {}) {
        const params = { participant_id: participantId };
        const initialRq = await this.get("dm_conversations/with/:participant_id/dm_events", options, { fullResponse: true, params });
        return new dm_paginator_v2_1.OneToOneDMTimelineV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /**
       * Returns a list of Direct Messages within a conversation specified in the dm_conversation_id path parameter.
       * Messages are returned in reverse chronological order.
       *
       * OAuth 2 scopes: `dm.read`, `tweet.read`, `user.read`
       *
       * https://developer.x.com/en/docs/twitter-api/direct-messages/lookup/api-reference/get-dm_conversations-dm_conversation_id-dm_events
       */
      async listDmEventsOfConversation(dmConversationId, options = {}) {
        const params = { dm_conversation_id: dmConversationId };
        const initialRq = await this.get("dm_conversations/:dm_conversation_id/dm_events", options, { fullResponse: true, params });
        return new dm_paginator_v2_1.ConversationDMTimelineV2Paginator({
          realData: initialRq.data,
          rateLimit: initialRq.rateLimit,
          instance: this,
          queryParams: { ...options },
          sharedParams: params
        });
      }
      /* Spaces */
      /**
       * Get a single space by ID.
       * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces-id
       *
       * OAuth2 scopes: `tweet.read`, `users.read`, `space.read`.
       */
      space(spaceId, options = {}) {
        return this.get("spaces/:id", options, { params: { id: spaceId } });
      }
      /**
       * Get spaces using their IDs.
       * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces
       *
       * OAuth2 scopes: `tweet.read`, `users.read`, `space.read`.
       */
      spaces(spaceIds, options = {}) {
        return this.get("spaces", { ids: spaceIds, ...options });
      }
      /**
       * Get spaces using their creator user ID(s). (no pagination available)
       * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces-by-creator-ids
       *
       * OAuth2 scopes: `tweet.read`, `users.read`, `space.read`.
       */
      spacesByCreators(creatorIds, options = {}) {
        return this.get("spaces/by/creator_ids", { user_ids: creatorIds, ...options });
      }
      /**
       * Search through spaces using multiple params. (no pagination available)
       * https://developer.x.com/en/docs/twitter-api/spaces/search/api-reference/get-spaces-search
       */
      searchSpaces(options) {
        return this.get("spaces/search", options);
      }
      /**
      * Returns a list of user who purchased a ticket to the requested Space.
      * You must authenticate the request using the Access Token of the creator of the requested Space.
      *
      * **OAuth 2.0 Access Token required**
      *
      * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces-id-buyers
      *
      * OAuth2 scopes: `tweet.read`, `users.read`, `space.read`.
      */
      spaceBuyers(spaceId, options = {}) {
        return this.get("spaces/:id/buyers", options, { params: { id: spaceId } });
      }
      /**
       * Returns Tweets shared in the requested Spaces.
       * https://developer.x.com/en/docs/twitter-api/spaces/lookup/api-reference/get-spaces-id-tweets
       *
       * OAuth2 scope: `users.read`, `tweet.read`, `space.read`
       */
      spaceTweets(spaceId, options = {}) {
        return this.get("spaces/:id/tweets", options, { params: { id: spaceId } });
      }
      searchStream({ autoConnect, ...options } = {}) {
        return this.getStream("tweets/search/stream", options, { payloadIsError: helpers_1.isTweetStreamV2ErrorPayload, autoConnect });
      }
      /**
       * Return a list of rules currently active on the streaming endpoint, either as a list or individually.
       * https://developer.x.com/en/docs/twitter-api/tweets/filtered-stream/api-reference/get-tweets-search-stream-rules
       */
      streamRules(options = {}) {
        return this.get("tweets/search/stream/rules", options);
      }
      updateStreamRules(options, query = {}) {
        return this.post("tweets/search/stream/rules", options, { query });
      }
      sampleStream({ autoConnect, ...options } = {}) {
        return this.getStream("tweets/sample/stream", options, { payloadIsError: helpers_1.isTweetStreamV2ErrorPayload, autoConnect });
      }
      sample10Stream({ autoConnect, ...options } = {}) {
        return this.getStream("tweets/sample10/stream", options, { payloadIsError: helpers_1.isTweetStreamV2ErrorPayload, autoConnect });
      }
      /* Batch compliance */
      /**
       * Returns a list of recent compliance jobs.
       * https://developer.x.com/en/docs/twitter-api/compliance/batch-compliance/api-reference/get-compliance-jobs
       */
      complianceJobs(options) {
        return this.get("compliance/jobs", options);
      }
      /**
       * Get a single compliance job with the specified ID.
       * https://developer.x.com/en/docs/twitter-api/compliance/batch-compliance/api-reference/get-compliance-jobs-id
       */
      complianceJob(jobId) {
        return this.get("compliance/jobs/:id", void 0, { params: { id: jobId } });
      }
      /**
       * Creates a new compliance job for Tweet IDs or user IDs, send your file, await result and parse it into an array.
       * You can run one batch job at a time. Returns the created job, but **not the job result!**.
       *
       * You can obtain the result (**after job is completed**) with `.complianceJobResult`.
       * https://developer.x.com/en/docs/twitter-api/compliance/batch-compliance/api-reference/post-compliance-jobs
       */
      async sendComplianceJob(jobParams) {
        const job = await this.post("compliance/jobs", { type: jobParams.type, name: jobParams.name });
        const rawIdsBody = jobParams.ids instanceof Buffer ? jobParams.ids : Buffer.from(jobParams.ids.join("\n"));
        await this.put(job.data.upload_url, rawIdsBody, {
          forceBodyMode: "raw",
          enableAuth: false,
          headers: { "Content-Type": "text/plain" },
          prefix: ""
        });
        return job;
      }
      /**
       * Get the result of a running or completed job, obtained through `.complianceJob`, `.complianceJobs` or `.sendComplianceJob`.
       * If job is still running (`in_progress`), it will await until job is completed. **This could be quite long!**
       * https://developer.x.com/en/docs/twitter-api/compliance/batch-compliance/api-reference/post-compliance-jobs
       */
      async complianceJobResult(job) {
        let runningJob = job;
        while (runningJob.status !== "complete") {
          if (runningJob.status === "expired" || runningJob.status === "failed") {
            throw new Error("Job failed to be completed.");
          }
          await new Promise((resolve) => setTimeout(resolve, 3500));
          runningJob = (await this.complianceJob(job.id)).data;
        }
        const result = await this.get(job.download_url, void 0, {
          enableAuth: false,
          prefix: ""
        });
        return result.trim().split("\n").filter((line) => line).map((line) => JSON.parse(line));
      }
      /* Usage */
      /**
       * Allows you to retrieve your project usage.
       *
       * https://developer.x.com/en/docs/x-api/usage/tweets/introduction
       */
      async usage(options = {}) {
        return this.get("usage/tweets", options);
      }
      /**
       * Returns a variety of information about a single Community specified by ID.
       * https://docs.x.com/x-api/communities/communities-lookup-by-community-id
       */
      community(communityId, options = {}) {
        return this.get("communities/:id", options, { params: { id: communityId } });
      }
      /**
       * Search for Communities based on keywords.
       * https://docs.x.com/x-api/communities/search-communities
       */
      searchCommunities(query, options = {}) {
        return this.get("communities/search", { query, ...options });
      }
    };
    exports2.default = TwitterApiv2ReadOnly;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v2-labs/client.v2.labs.write.js
var require_client_v2_labs_write = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v2-labs/client.v2.labs.write.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var globals_1 = require_globals();
    var client_v2_labs_read_1 = __importDefault(require_client_v2_labs_read());
    var TwitterApiv2LabsReadWrite = class extends client_v2_labs_read_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V2_LABS_PREFIX;
      }
      /**
       * Get a client with only read rights.
       */
      get readOnly() {
        return this;
      }
    };
    exports2.default = TwitterApiv2LabsReadWrite;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v2/client.v2.write.js
var require_client_v2_write = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v2/client.v2.write.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var globals_1 = require_globals();
    var client_v2_read_1 = __importDefault(require_client_v2_read());
    var client_v2_labs_write_1 = __importDefault(require_client_v2_labs_write());
    var TwitterApiv2ReadWrite = class extends client_v2_read_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V2_PREFIX;
      }
      /* Sub-clients */
      /**
       * Get a client with only read rights.
       */
      get readOnly() {
        return this;
      }
      /**
       * Get a client for v2 labs endpoints.
       */
      get labs() {
        if (this._labs)
          return this._labs;
        return this._labs = new client_v2_labs_write_1.default(this);
      }
      /* Tweets */
      /**
       * Hides or unhides a reply to a Tweet.
       * https://developer.x.com/en/docs/twitter-api/tweets/hide-replies/api-reference/put-tweets-id-hidden
       */
      hideReply(tweetId, makeHidden) {
        return this.put("tweets/:id/hidden", { hidden: makeHidden }, { params: { id: tweetId } });
      }
      /**
       * Causes the user ID identified in the path parameter to Like the target Tweet.
       * https://developer.x.com/en/docs/twitter-api/tweets/likes/api-reference/post-users-user_id-likes
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      like(loggedUserId, targetTweetId) {
        return this.post("users/:id/likes", { tweet_id: targetTweetId }, { params: { id: loggedUserId } });
      }
      /**
       * Allows a user or authenticated user ID to unlike a Tweet.
       * The request succeeds with no action when the user sends a request to a user they're not liking the Tweet or have already unliked the Tweet.
       * https://developer.x.com/en/docs/twitter-api/tweets/likes/api-reference/delete-users-id-likes-tweet_id
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      unlike(loggedUserId, targetTweetId) {
        return this.delete("users/:id/likes/:tweet_id", void 0, {
          params: { id: loggedUserId, tweet_id: targetTweetId }
        });
      }
      /**
       * Causes the user ID identified in the path parameter to Retweet the target Tweet.
       * https://developer.x.com/en/docs/twitter-api/tweets/retweets/api-reference/post-users-id-retweets
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      retweet(loggedUserId, targetTweetId) {
        return this.post("users/:id/retweets", { tweet_id: targetTweetId }, { params: { id: loggedUserId } });
      }
      /**
       * Allows a user or authenticated user ID to remove the Retweet of a Tweet.
       * The request succeeds with no action when the user sends a request to a user they're not Retweeting the Tweet or have already removed the Retweet of.
       * https://developer.x.com/en/docs/twitter-api/tweets/retweets/api-reference/delete-users-id-retweets-tweet_id
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      unretweet(loggedUserId, targetTweetId) {
        return this.delete("users/:id/retweets/:tweet_id", void 0, {
          params: { id: loggedUserId, tweet_id: targetTweetId }
        });
      }
      tweet(status, payload = {}) {
        if (typeof status === "object") {
          payload = status;
        } else {
          payload = { text: status, ...payload };
        }
        return this.post("tweets", payload);
      }
      /**
       * Uploads media to Twitter using chunked upload.
       * https://docs.x.com/x-api/media/media-upload
       *
       * @param media The media buffer to upload
       * @param options Upload options including media type and category, and additional owners
       * @param chunkSize Size of each chunk in bytes (default: 1MB)
       * @returns The media ID of the uploaded media
       */
      async uploadMedia(media, options, chunkSize = 1024 * 1024) {
        let media_category = options.media_category;
        if (!options.media_category) {
          if (options.media_type.includes("gif")) {
            media_category = "tweet_gif";
          } else if (options.media_type.includes("image")) {
            media_category = "tweet_image";
          } else if (options.media_type.includes("video")) {
            media_category = "tweet_video";
          }
        }
        const initArguments = {
          additional_owners: options.additional_owners,
          media_type: options.media_type,
          total_bytes: media.length,
          media_category
        };
        const initResponse = await this.post("media/upload/initialize", initArguments);
        const mediaId = initResponse.data.id;
        const chunksCount = Math.ceil(media.length / chunkSize);
        const mediaArray = new Uint8Array(media);
        for (let i = 0; i < chunksCount; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, media.length);
          const mediaChunk = mediaArray.slice(start, end);
          const chunkedBuffer = Buffer.from(mediaChunk);
          const appendArguments = {
            segment_index: i,
            media: chunkedBuffer
          };
          await this.post(`media/upload/${mediaId}/append`, appendArguments, { forceBodyMode: "form-data" });
        }
        const finalizeResponse = await this.post(`media/upload/${mediaId}/finalize`);
        if (finalizeResponse.data.processing_info) {
          await this.waitForMediaProcessing(mediaId);
        }
        return mediaId;
      }
      async waitForMediaProcessing(mediaId) {
        var _a;
        const response = await this.get("media/upload", {
          command: "STATUS",
          media_id: mediaId
        });
        const info = response.data.processing_info;
        if (!info)
          return;
        switch (info.state) {
          case "succeeded":
            return;
          case "failed":
            throw new Error(`Media processing failed: ${(_a = info.error) === null || _a === void 0 ? void 0 : _a.message}`);
          case "pending":
          case "in_progress": {
            const waitTime = info === null || info === void 0 ? void 0 : info.check_after_secs;
            if (waitTime && waitTime > 0) {
              await new Promise((resolve) => setTimeout(resolve, waitTime * 1e3));
              await this.waitForMediaProcessing(mediaId);
            }
          }
        }
      }
      /**
       * Creates the metadata for media to be uploaded.
       * This feature is currently only supported for images and GIFs.
       * https://docs.x.com/x-api/media/metadata-create
       */
      createMediaMetadata(mediaId, metadata) {
        return this.post("media/metadata", { id: mediaId, metadata });
      }
      /**
       * Reply to a Tweet on behalf of an authenticated user.
       * https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
       */
      reply(status, toTweetId, payload = {}) {
        var _a;
        const reply = { in_reply_to_tweet_id: toTweetId, ...(_a = payload.reply) !== null && _a !== void 0 ? _a : {} };
        return this.post("tweets", { text: status, ...payload, reply });
      }
      /**
       * Quote an existing Tweet on behalf of an authenticated user.
       * https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
       */
      quote(status, quotedTweetId, payload = {}) {
        return this.tweet(status, { ...payload, quote_tweet_id: quotedTweetId });
      }
      /**
       * Post a series of tweets.
       * https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
       */
      async tweetThread(tweets) {
        var _a, _b;
        const postedTweets = [];
        for (const tweet of tweets) {
          const lastTweet = postedTweets.length ? postedTweets[postedTweets.length - 1] : null;
          const queryParams = { ...typeof tweet === "string" ? { text: tweet } : tweet };
          const inReplyToId = lastTweet ? lastTweet.data.id : (_a = queryParams.reply) === null || _a === void 0 ? void 0 : _a.in_reply_to_tweet_id;
          const status = (_b = queryParams.text) !== null && _b !== void 0 ? _b : "";
          if (inReplyToId) {
            postedTweets.push(await this.reply(status, inReplyToId, queryParams));
          } else {
            postedTweets.push(await this.tweet(status, queryParams));
          }
        }
        return postedTweets;
      }
      /**
       * Allows a user or authenticated user ID to delete a Tweet
       * https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/delete-tweets-id
       */
      deleteTweet(tweetId) {
        return this.delete("tweets/:id", void 0, {
          params: {
            id: tweetId
          }
        });
      }
      /* Bookmarks */
      /**
       * Causes the user ID of an authenticated user identified in the path parameter to Bookmark the target Tweet provided in the request body.
       * https://developer.x.com/en/docs/twitter-api/tweets/bookmarks/api-reference/post-users-id-bookmarks
       *
       * OAuth2 scopes: `users.read` `tweet.read` `bookmark.write`
       */
      async bookmark(tweetId) {
        const user = await this.getCurrentUserV2Object();
        return this.post("users/:id/bookmarks", { tweet_id: tweetId }, { params: { id: user.data.id } });
      }
      /**
       * Allows a user or authenticated user ID to remove a Bookmark of a Tweet.
       * https://developer.x.com/en/docs/twitter-api/tweets/bookmarks/api-reference/delete-users-id-bookmarks-tweet_id
       *
       * OAuth2 scopes: `users.read` `tweet.read` `bookmark.write`
       */
      async deleteBookmark(tweetId) {
        const user = await this.getCurrentUserV2Object();
        return this.delete("users/:id/bookmarks/:tweet_id", void 0, { params: { id: user.data.id, tweet_id: tweetId } });
      }
      /* Users */
      /**
       * Allows a user ID to follow another user.
       * If the target user does not have public Tweets, this endpoint will send a follow request.
       * https://developer.x.com/en/docs/twitter-api/users/follows/api-reference/post-users-source_user_id-following
       *
       * OAuth2 scope: `follows.write`
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      follow(loggedUserId, targetUserId) {
        return this.post("users/:id/following", { target_user_id: targetUserId }, { params: { id: loggedUserId } });
      }
      /**
       * Allows a user ID to unfollow another user.
       * https://developer.x.com/en/docs/twitter-api/users/follows/api-reference/delete-users-source_id-following
       *
       * OAuth2 scope: `follows.write`
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      unfollow(loggedUserId, targetUserId) {
        return this.delete("users/:source_user_id/following/:target_user_id", void 0, {
          params: { source_user_id: loggedUserId, target_user_id: targetUserId }
        });
      }
      /**
       * Causes the user (in the path) to block the target user.
       * The user (in the path) must match the user context authorizing the request.
       * https://developer.x.com/en/docs/twitter-api/users/blocks/api-reference/post-users-user_id-blocking
       *
       * **Note**: You must specify the currently logged user ID; you can obtain it through v1.1 API.
       */
      block(loggedUserId, targetUserId) {
        return this.post("users/:id/blocking", { target_user_id: targetUserId }, { params: { id: loggedUserId } });
      }
      /**
       * Allows a user or authenticated user ID to unblock another user.
       * https://developer.x.com/en/docs/twitter-api/users/blocks/api-reference/delete-users-user_id-blocking
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      unblock(loggedUserId, targetUserId) {
        return this.delete("users/:source_user_id/blocking/:target_user_id", void 0, {
          params: { source_user_id: loggedUserId, target_user_id: targetUserId }
        });
      }
      /**
       * Allows an authenticated user ID to mute the target user.
       * https://developer.x.com/en/docs/twitter-api/users/mutes/api-reference/post-users-user_id-muting
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      mute(loggedUserId, targetUserId) {
        return this.post("users/:id/muting", { target_user_id: targetUserId }, { params: { id: loggedUserId } });
      }
      /**
       * Allows an authenticated user ID to unmute the target user.
       * The request succeeds with no action when the user sends a request to a user they're not muting or have already unmuted.
       * https://developer.x.com/en/docs/twitter-api/users/mutes/api-reference/delete-users-user_id-muting
       *
       * **Note**: You must specify the currently logged user ID ; you can obtain it through v1.1 API.
       */
      unmute(loggedUserId, targetUserId) {
        return this.delete("users/:source_user_id/muting/:target_user_id", void 0, {
          params: { source_user_id: loggedUserId, target_user_id: targetUserId }
        });
      }
      /* Lists */
      /**
       * Creates a new list for the authenticated user.
       * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/post-lists
       */
      createList(options) {
        return this.post("lists", options);
      }
      /**
       * Updates the specified list. The authenticated user must own the list to be able to update it.
       * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/put-lists-id
       */
      updateList(listId, options = {}) {
        return this.put("lists/:id", options, { params: { id: listId } });
      }
      /**
       * Deletes the specified list. The authenticated user must own the list to be able to destroy it.
       * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/delete-lists-id
       */
      removeList(listId) {
        return this.delete("lists/:id", void 0, { params: { id: listId } });
      }
      /**
       * Adds a member to a list.
       * https://developer.x.com/en/docs/twitter-api/lists/list-members/api-reference/post-lists-id-members
       */
      addListMember(listId, userId) {
        return this.post("lists/:id/members", { user_id: userId }, { params: { id: listId } });
      }
      /**
       * Remember a member to a list.
       * https://developer.x.com/en/docs/twitter-api/lists/list-members/api-reference/delete-lists-id-members-user_id
       */
      removeListMember(listId, userId) {
        return this.delete("lists/:id/members/:user_id", void 0, { params: { id: listId, user_id: userId } });
      }
      /**
       * Subscribes the authenticated user to the specified list.
       * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/post-users-id-followed-lists
       */
      subscribeToList(loggedUserId, listId) {
        return this.post("users/:id/followed_lists", { list_id: listId }, { params: { id: loggedUserId } });
      }
      /**
       * Unsubscribes the authenticated user to the specified list.
       * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/delete-users-id-followed-lists-list_id
       */
      unsubscribeOfList(loggedUserId, listId) {
        return this.delete("users/:id/followed_lists/:list_id", void 0, { params: { id: loggedUserId, list_id: listId } });
      }
      /**
       * Enables the authenticated user to pin a List.
       * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/post-users-id-pinned-lists
       */
      pinList(loggedUserId, listId) {
        return this.post("users/:id/pinned_lists", { list_id: listId }, { params: { id: loggedUserId } });
      }
      /**
       * Enables the authenticated user to unpin a List.
       * https://developer.x.com/en/docs/twitter-api/lists/manage-lists/api-reference/delete-users-id-pinned-lists-list_id
       */
      unpinList(loggedUserId, listId) {
        return this.delete("users/:id/pinned_lists/:list_id", void 0, { params: { id: loggedUserId, list_id: listId } });
      }
      /* Direct messages */
      /**
       * Creates a Direct Message on behalf of an authenticated user, and adds it to the specified conversation.
       * https://developer.x.com/en/docs/twitter-api/direct-messages/manage/api-reference/post-dm_conversations-dm_conversation_id-messages
       */
      sendDmInConversation(conversationId, message) {
        return this.post("dm_conversations/:dm_conversation_id/messages", message, { params: { dm_conversation_id: conversationId } });
      }
      /**
       * Creates a one-to-one Direct Message and adds it to the one-to-one conversation.
       * This method either creates a new one-to-one conversation or retrieves the current conversation and adds the Direct Message to it.
       * https://developer.x.com/en/docs/twitter-api/direct-messages/manage/api-reference/post-dm_conversations-with-participant_id-messages
       */
      sendDmToParticipant(participantId, message) {
        return this.post("dm_conversations/with/:participant_id/messages", message, { params: { participant_id: participantId } });
      }
      /**
       * Creates a new group conversation and adds a Direct Message to it on behalf of an authenticated user.
       * https://developer.x.com/en/docs/twitter-api/direct-messages/manage/api-reference/post-dm_conversations
       */
      createDmConversation(options) {
        return this.post("dm_conversations", options);
      }
    };
    exports2.default = TwitterApiv2ReadWrite;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v2-labs/client.v2.labs.js
var require_client_v2_labs = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v2-labs/client.v2.labs.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterApiv2Labs = void 0;
    var globals_1 = require_globals();
    var client_v2_labs_write_1 = __importDefault(require_client_v2_labs_write());
    var TwitterApiv2Labs = class extends client_v2_labs_write_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V2_LABS_PREFIX;
      }
      /**
       * Get a client with read/write rights.
       */
      get readWrite() {
        return this;
      }
    };
    exports2.TwitterApiv2Labs = TwitterApiv2Labs;
    exports2.default = TwitterApiv2Labs;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/v2/client.v2.js
var require_client_v2 = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/v2/client.v2.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterApiv2 = void 0;
    var globals_1 = require_globals();
    var client_v2_write_1 = __importDefault(require_client_v2_write());
    var client_v2_labs_1 = __importDefault(require_client_v2_labs());
    var TwitterApiv2 = class extends client_v2_write_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_V2_PREFIX;
      }
      /* Sub-clients */
      /**
       * Get a client with read/write rights.
       */
      get readWrite() {
        return this;
      }
      /**
       * Get a client for v2 labs endpoints.
       */
      get labs() {
        if (this._labs)
          return this._labs;
        return this._labs = new client_v2_labs_1.default(this);
      }
    };
    exports2.TwitterApiv2 = TwitterApiv2;
    exports2.default = TwitterApiv2;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client/readonly.js
var require_readonly = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client/readonly.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var client_base_1 = __importDefault(require_client_base());
    var client_v1_read_1 = __importDefault(require_client_v1_read());
    var client_v2_read_1 = __importDefault(require_client_v2_read());
    var oauth2_helper_1 = require_oauth2_helper();
    var request_param_helper_1 = __importDefault(require_request_param_helper());
    var TwitterApiReadOnly = class extends client_base_1.default {
      /* Direct access to subclients */
      get v1() {
        if (this._v1)
          return this._v1;
        return this._v1 = new client_v1_read_1.default(this);
      }
      get v2() {
        if (this._v2)
          return this._v2;
        return this._v2 = new client_v2_read_1.default(this);
      }
      /**
       * Fetch and cache current user.
       * This method can only be called with a OAuth 1.0a user authentication.
       *
       * You can use this method to test if authentication was successful.
       * Next calls to this methods will use the cached user, unless `forceFetch: true` is given.
       */
      async currentUser(forceFetch = false) {
        return await this.getCurrentUserObject(forceFetch);
      }
      /**
       * Fetch and cache current user.
       * This method can only be called with a OAuth 1.0a or OAuth2 user authentication.
       *
       * This can only be the slimest available `UserV2` object, with only id, name and username properties defined.
       * To get a customized `UserV2Result`, use `.v2.me()`
       *
       * You can use this method to test if authentication was successful.
       * Next calls to this methods will use the cached user, unless `forceFetch: true` is given.
       *
       * OAuth2 scopes: `tweet.read` & `users.read`
       */
      async currentUserV2(forceFetch = false) {
        return await this.getCurrentUserV2Object(forceFetch);
      }
      /* Shortcuts to endpoints */
      search(what, options) {
        return this.v2.search(what, options);
      }
      /* Authentication */
      /**
       * Generate the OAuth request token link for user-based OAuth 1.0 auth.
       *
       * ```ts
       * // Instantiate TwitterApi with consumer keys
       * const client = new TwitterApi({ appKey: 'consumer_key', appSecret: 'consumer_secret' });
       *
       * const tokenRequest = await client.generateAuthLink('oob-or-your-callback-url');
       * // redirect end-user to tokenRequest.url
       *
       * // Save tokenRequest.oauth_token_secret somewhere, it will be needed for next auth step.
       * ```
       */
      async generateAuthLink(oauth_callback = "oob", { authAccessType, linkMode = "authenticate", forceLogin, screenName } = {}) {
        const oauthResult = await this.post("https://api.x.com/oauth/request_token", { oauth_callback, x_auth_access_type: authAccessType });
        let url = `https://api.x.com/oauth/${linkMode}?oauth_token=${encodeURIComponent(oauthResult.oauth_token)}`;
        if (forceLogin !== void 0) {
          url += `&force_login=${encodeURIComponent(forceLogin)}`;
        }
        if (screenName !== void 0) {
          url += `&screen_name=${encodeURIComponent(screenName)}`;
        }
        if (this._requestMaker.hasPlugins()) {
          this._requestMaker.applyPluginMethod("onOAuth1RequestToken", {
            client: this._requestMaker,
            url,
            oauthResult
          });
        }
        return {
          url,
          ...oauthResult
        };
      }
      /**
       * Obtain access to user-based OAuth 1.0 auth.
       *
       * After user is redirect from your callback, use obtained oauth_token and oauth_verifier to
       * instantiate the new TwitterApi instance.
       *
       * ```ts
       * // Use the saved oauth_token_secret associated to oauth_token returned by callback
       * const requestClient = new TwitterApi({
       *  appKey: 'consumer_key',
       *  appSecret: 'consumer_secret',
       *  accessToken: 'oauth_token',
       *  accessSecret: 'oauth_token_secret'
       * });
       *
       * // Use oauth_verifier obtained from callback request
       * const { client: userClient } = await requestClient.login('oauth_verifier');
       *
       * // {userClient} is a valid {TwitterApi} object you can use for future requests
       * ```
       */
      async login(oauth_verifier) {
        const tokens = this.getActiveTokens();
        if (tokens.type !== "oauth-1.0a")
          throw new Error("You must setup TwitterApi instance with consumer keys to accept OAuth 1.0 login");
        const oauth_result = await this.post("https://api.x.com/oauth/access_token", { oauth_token: tokens.accessToken, oauth_verifier });
        const client = new this.constructor({
          appKey: tokens.appKey,
          appSecret: tokens.appSecret,
          accessToken: oauth_result.oauth_token,
          accessSecret: oauth_result.oauth_token_secret
        }, this._requestMaker.clientSettings);
        return {
          accessToken: oauth_result.oauth_token,
          accessSecret: oauth_result.oauth_token_secret,
          userId: oauth_result.user_id,
          screenName: oauth_result.screen_name,
          client
        };
      }
      /**
       * Enable application-only authentication.
       *
       * To make the request, instantiate TwitterApi with consumer and secret.
       *
       * ```ts
       * const requestClient = new TwitterApi({ appKey: 'consumer', appSecret: 'secret' });
       * const appClient = await requestClient.appLogin();
       *
       * // Use {appClient} to make requests
       * ```
       */
      async appLogin() {
        const tokens = this.getActiveTokens();
        if (tokens.type !== "oauth-1.0a")
          throw new Error("You must setup TwitterApi instance with consumer keys to accept app-only login");
        const basicClient = new this.constructor({ username: tokens.appKey, password: tokens.appSecret }, this._requestMaker.clientSettings);
        const res = await basicClient.post("https://api.x.com/oauth2/token", { grant_type: "client_credentials" });
        return new this.constructor(res.access_token, this._requestMaker.clientSettings);
      }
      /* OAuth 2 user authentication */
      /**
       * Generate the OAuth request token link for user-based OAuth 2.0 auth.
       *
       * - **You can only use v2 API endpoints with this authentication method.**
       * - **You need to specify which scope you want to have when you create your auth link. Make sure it matches your needs.**
       *
       * See https://developer.x.com/en/docs/authentication/oauth-2-0/user-access-token for details.
       *
       * ```ts
       * // Instantiate TwitterApi with client ID
       * const client = new TwitterApi({ clientId: 'yourClientId' });
       *
       * // Generate a link to callback URL that will gives a token with tweet+user read access
       * const link = client.generateOAuth2AuthLink('your-callback-url', { scope: ['tweet.read', 'users.read'] });
       *
       * // Extract props from generate link
       * const { url, state, codeVerifier } = link;
       *
       * // redirect end-user to url
       * // Save `state` and `codeVerifier` somewhere, it will be needed for next auth step.
       * ```
       */
      generateOAuth2AuthLink(redirectUri, options = {}) {
        var _a, _b;
        if (!this._requestMaker.clientId) {
          throw new Error("Twitter API instance is not initialized with client ID. You can find your client ID in Twitter Developer Portal. Please build an instance with: new TwitterApi({ clientId: '<yourClientId>' })");
        }
        const state = (_a = options.state) !== null && _a !== void 0 ? _a : oauth2_helper_1.OAuth2Helper.generateRandomString(32);
        const codeVerifier = oauth2_helper_1.OAuth2Helper.getCodeVerifier();
        const codeChallenge = oauth2_helper_1.OAuth2Helper.getCodeChallengeFromVerifier(codeVerifier);
        const rawScope = (_b = options.scope) !== null && _b !== void 0 ? _b : "";
        const scope = Array.isArray(rawScope) ? rawScope.join(" ") : rawScope;
        const url = new URL("https://x.com/i/oauth2/authorize");
        const query = {
          response_type: "code",
          client_id: this._requestMaker.clientId,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "s256",
          scope
        };
        request_param_helper_1.default.addQueryParamsToUrl(url, query);
        const result = {
          url: url.toString(),
          state,
          codeVerifier,
          codeChallenge
        };
        if (this._requestMaker.hasPlugins()) {
          this._requestMaker.applyPluginMethod("onOAuth2RequestToken", {
            client: this._requestMaker,
            result,
            redirectUri
          });
        }
        return result;
      }
      /**
       * Obtain access to user-based OAuth 2.0 auth.
       *
       * After user is redirect from your callback, use obtained code to
       * instantiate the new TwitterApi instance.
       *
       * You need to obtain `codeVerifier` from a call to `.generateOAuth2AuthLink`.
       *
       * ```ts
       * // Use the saved codeVerifier associated to state (present in query string of callback)
       * const requestClient = new TwitterApi({ clientId: 'yourClientId' });
       *
       * const { client: userClient, refreshToken } = await requestClient.loginWithOAuth2({
       *  code: 'codeFromQueryString',
       *  // the same URL given to generateOAuth2AuthLink
       *  redirectUri,
       *  // the verifier returned by generateOAuth2AuthLink
       *  codeVerifier,
       * });
       *
       * // {userClient} is a valid {TwitterApi} object you can use for future requests
       * // {refreshToken} is defined if 'offline.access' is in scope.
       * ```
       */
      async loginWithOAuth2({ code, codeVerifier, redirectUri }) {
        if (!this._requestMaker.clientId) {
          throw new Error("Twitter API instance is not initialized with client ID. Please build an instance with: new TwitterApi({ clientId: '<yourClientId>' })");
        }
        const accessTokenResult = await this.post("https://api.x.com/2/oauth2/token", {
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          client_id: this._requestMaker.clientId,
          client_secret: this._requestMaker.clientSecret
        });
        return this.parseOAuth2AccessTokenResult(accessTokenResult);
      }
      /**
       * Obtain a new access token to user-based OAuth 2.0 auth from a refresh token.
       *
       * ```ts
       * const requestClient = new TwitterApi({ clientId: 'yourClientId' });
       *
       * const { client: userClient } = await requestClient.refreshOAuth2Token('refreshToken');
       * // {userClient} is a valid {TwitterApi} object you can use for future requests
       * ```
       */
      async refreshOAuth2Token(refreshToken) {
        if (!this._requestMaker.clientId) {
          throw new Error("Twitter API instance is not initialized with client ID. Please build an instance with: new TwitterApi({ clientId: '<yourClientId>' })");
        }
        const accessTokenResult = await this.post("https://api.x.com/2/oauth2/token", {
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          client_id: this._requestMaker.clientId,
          client_secret: this._requestMaker.clientSecret
        });
        return this.parseOAuth2AccessTokenResult(accessTokenResult);
      }
      /**
       * Revoke a single user-based OAuth 2.0 token.
       *
       * You must specify its source, access token (directly after login)
       * or refresh token (if you've called `.refreshOAuth2Token` before).
       */
      async revokeOAuth2Token(token, tokenType = "access_token") {
        if (!this._requestMaker.clientId) {
          throw new Error("Twitter API instance is not initialized with client ID. Please build an instance with: new TwitterApi({ clientId: '<yourClientId>' })");
        }
        return await this.post("https://api.x.com/2/oauth2/revoke", {
          client_id: this._requestMaker.clientId,
          client_secret: this._requestMaker.clientSecret,
          token,
          token_type_hint: tokenType
        });
      }
      parseOAuth2AccessTokenResult(result) {
        const client = new this.constructor(result.access_token, this._requestMaker.clientSettings);
        const scope = result.scope.split(" ").filter((e) => e);
        return {
          client,
          expiresIn: result.expires_in,
          accessToken: result.access_token,
          scope,
          refreshToken: result.refresh_token
        };
      }
    };
    exports2.default = TwitterApiReadOnly;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client/readwrite.js
var require_readwrite = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client/readwrite.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var client_v1_write_1 = __importDefault(require_client_v1_write());
    var client_v2_write_1 = __importDefault(require_client_v2_write());
    var readonly_1 = __importDefault(require_readonly());
    var TwitterApiReadWrite = class extends readonly_1.default {
      /* Direct access to subclients */
      get v1() {
        if (this._v1)
          return this._v1;
        return this._v1 = new client_v1_write_1.default(this);
      }
      get v2() {
        if (this._v2)
          return this._v2;
        return this._v2 = new client_v2_write_1.default(this);
      }
      /**
       * Get a client with read only rights.
       */
      get readOnly() {
        return this;
      }
    };
    exports2.default = TwitterApiReadWrite;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/ads/client.ads.read.js
var require_client_ads_read = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/ads/client.ads.read.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var client_subclient_1 = __importDefault(require_client_subclient());
    var globals_1 = require_globals();
    var TwitterAdsReadOnly = class extends client_subclient_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_ADS_PREFIX;
      }
    };
    exports2.default = TwitterAdsReadOnly;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/ads/client.ads.write.js
var require_client_ads_write = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/ads/client.ads.write.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var globals_1 = require_globals();
    var client_ads_read_1 = __importDefault(require_client_ads_read());
    var TwitterAdsReadWrite = class extends client_ads_read_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_ADS_PREFIX;
      }
      /**
       * Get a client with only read rights.
       */
      get readOnly() {
        return this;
      }
    };
    exports2.default = TwitterAdsReadWrite;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/ads-sandbox/client.ads-sandbox.read.js
var require_client_ads_sandbox_read = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/ads-sandbox/client.ads-sandbox.read.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var client_subclient_1 = __importDefault(require_client_subclient());
    var globals_1 = require_globals();
    var TwitterAdsSandboxReadOnly = class extends client_subclient_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_ADS_SANDBOX_PREFIX;
      }
    };
    exports2.default = TwitterAdsSandboxReadOnly;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/ads-sandbox/client.ads-sandbox.write.js
var require_client_ads_sandbox_write = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/ads-sandbox/client.ads-sandbox.write.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var globals_1 = require_globals();
    var client_ads_sandbox_read_1 = __importDefault(require_client_ads_sandbox_read());
    var TwitterAdsSandboxReadWrite = class extends client_ads_sandbox_read_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_ADS_SANDBOX_PREFIX;
      }
      /**
       * Get a client with only read rights.
       */
      get readOnly() {
        return this;
      }
    };
    exports2.default = TwitterAdsSandboxReadWrite;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/ads-sandbox/client.ads-sandbox.js
var require_client_ads_sandbox = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/ads-sandbox/client.ads-sandbox.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterAdsSandbox = void 0;
    var globals_1 = require_globals();
    var client_ads_sandbox_write_1 = __importDefault(require_client_ads_sandbox_write());
    var TwitterAdsSandbox = class extends client_ads_sandbox_write_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_ADS_SANDBOX_PREFIX;
      }
      /**
       * Get a client with read/write rights.
       */
      get readWrite() {
        return this;
      }
    };
    exports2.TwitterAdsSandbox = TwitterAdsSandbox;
    exports2.default = TwitterAdsSandbox;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/ads/client.ads.js
var require_client_ads = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/ads/client.ads.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterAds = void 0;
    var globals_1 = require_globals();
    var client_ads_write_1 = __importDefault(require_client_ads_write());
    var client_ads_sandbox_1 = __importDefault(require_client_ads_sandbox());
    var TwitterAds = class extends client_ads_write_1.default {
      constructor() {
        super(...arguments);
        this._prefix = globals_1.API_ADS_PREFIX;
      }
      /**
       * Get a client with read/write rights.
       */
      get readWrite() {
        return this;
      }
      /**
       * Get Twitter Ads Sandbox API client
       */
      get sandbox() {
        if (this._sandbox)
          return this._sandbox;
        return this._sandbox = new client_ads_sandbox_1.default(this);
      }
    };
    exports2.TwitterAds = TwitterAds;
    exports2.default = TwitterAds;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/client/index.js
var require_client = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/client/index.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TwitterApiReadOnly = exports2.TwitterApiReadWrite = exports2.TwitterApi = void 0;
    var client_v1_1 = __importDefault(require_client_v1());
    var client_v2_1 = __importDefault(require_client_v2());
    var readwrite_1 = __importDefault(require_readwrite());
    var client_ads_1 = __importDefault(require_client_ads());
    var TwitterApi2 = class extends readwrite_1.default {
      /* Direct access to subclients */
      get v1() {
        if (this._v1)
          return this._v1;
        return this._v1 = new client_v1_1.default(this);
      }
      get v2() {
        if (this._v2)
          return this._v2;
        return this._v2 = new client_v2_1.default(this);
      }
      /**
       * Get a client with read/write rights.
       */
      get readWrite() {
        return this;
      }
      /**
       * Get Twitter Ads API client
       */
      get ads() {
        if (this._ads)
          return this._ads;
        return this._ads = new client_ads_1.default(this);
      }
      /* Static helpers */
      static getErrors(error) {
        var _a;
        if (typeof error !== "object")
          return [];
        if (!("data" in error))
          return [];
        return (_a = error.data.errors) !== null && _a !== void 0 ? _a : [];
      }
      /** Extract another image size than obtained in a `profile_image_url` or `profile_image_url_https` field of a user object. */
      static getProfileImageInSize(profileImageUrl, size) {
        const lastPart = profileImageUrl.split("/").pop();
        const sizes = ["normal", "bigger", "mini"];
        let originalUrl = profileImageUrl;
        for (const availableSize of sizes) {
          if (lastPart.includes(`_${availableSize}`)) {
            originalUrl = profileImageUrl.replace(`_${availableSize}`, "");
            break;
          }
        }
        if (size === "original") {
          return originalUrl;
        }
        const extPos = originalUrl.lastIndexOf(".");
        if (extPos !== -1) {
          const ext = originalUrl.slice(extPos + 1);
          return originalUrl.slice(0, extPos) + "_" + size + "." + ext;
        } else {
          return originalUrl + "_" + size;
        }
      }
    };
    exports2.TwitterApi = TwitterApi2;
    var readwrite_2 = require_readwrite();
    Object.defineProperty(exports2, "TwitterApiReadWrite", { enumerable: true, get: function() {
      return __importDefault(readwrite_2).default;
    } });
    var readonly_1 = require_readonly();
    Object.defineProperty(exports2, "TwitterApiReadOnly", { enumerable: true, get: function() {
      return __importDefault(readonly_1).default;
    } });
    exports2.default = TwitterApi2;
  }
});

// ../../node_modules/twitter-api-v2/dist/cjs/index.js
var require_cjs = __commonJS({
  "../../node_modules/twitter-api-v2/dist/cjs/index.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = void 0;
    var client_1 = require_client();
    Object.defineProperty(exports2, "default", { enumerable: true, get: function() {
      return __importDefault(client_1).default;
    } });
    __exportStar(require_client(), exports2);
    __exportStar(require_client_v1(), exports2);
    __exportStar(require_client_v2(), exports2);
    __exportStar(require_includes_v2_helper(), exports2);
    __exportStar(require_client_v2_labs(), exports2);
    __exportStar(require_types(), exports2);
    __exportStar(require_paginators(), exports2);
    __exportStar(require_TweetStream(), exports2);
    __exportStar(require_settings(), exports2);
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(index_exports);
var import_client_secrets_manager = require("@aws-sdk/client-secrets-manager");
var import_twitter_api_v2 = __toESM(require_cjs());
var secretsClient = new import_client_secrets_manager.SecretsManagerClient({ region: "ap-northeast-2" });
var TARGET_USERNAME = process.env.TARGET_USERNAME;
var TWITTER_TOKENS_SECRET_NAME = process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens";
var cachedFollowerCount = null;
var cacheTimestamp = 0;
var CACHE_TTL = 6 * 60 * 60 * 1e3;
async function getTwitterSecrets() {
  console.log(`[GET_FOLLOWER_COUNT] Fetching secrets from: ${TWITTER_TOKENS_SECRET_NAME}`);
  const command = new import_client_secrets_manager.GetSecretValueCommand({
    SecretId: TWITTER_TOKENS_SECRET_NAME
  });
  const response = await secretsClient.send(command);
  if (!response.SecretString) {
    throw new Error("Secret value is empty");
  }
  const secrets = JSON.parse(response.SecretString);
  if (!secrets.oauth2?.userAccessToken) {
    throw new Error("OAuth 2.0 User Access Token not found in secrets");
  }
  return {
    oauth2UserAccessToken: secrets.oauth2.userAccessToken
  };
}
async function fetchFollowerCount(secrets) {
  if (!TARGET_USERNAME) {
    throw new Error("TARGET_USERNAME environment variable is not set");
  }
  console.log(`[GET_FOLLOWER_COUNT] Fetching follower count for @${TARGET_USERNAME}`);
  const client = new import_twitter_api_v2.TwitterApi(secrets.oauth2UserAccessToken);
  const user = await client.v2.userByUsername(TARGET_USERNAME, {
    "user.fields": ["public_metrics"]
  });
  if (!user.data) {
    throw new Error(`User not found: @${TARGET_USERNAME}`);
  }
  const followersCount = user.data.public_metrics?.followers_count ?? 0;
  console.log(`[GET_FOLLOWER_COUNT] @${TARGET_USERNAME} has ${followersCount} followers`);
  return followersCount;
}
var corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
var handler = async () => {
  try {
    const now = Date.now();
    if (cachedFollowerCount !== null && now - cacheTimestamp < CACHE_TTL) {
      console.log(`[GET_FOLLOWER_COUNT] Using cached value: ${cachedFollowerCount}`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          count: cachedFollowerCount,
          username: TARGET_USERNAME,
          cached: true,
          updatedAt: new Date(cacheTimestamp).toISOString()
        })
      };
    }
    const secrets = await getTwitterSecrets();
    const followerCount = await fetchFollowerCount(secrets);
    cachedFollowerCount = followerCount;
    cacheTimestamp = now;
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        count: followerCount,
        username: TARGET_USERNAME,
        cached: false,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      })
    };
  } catch (err) {
    console.error("[GET_FOLLOWER_COUNT] Error:", err);
    if (cachedFollowerCount !== null) {
      console.log(`[GET_FOLLOWER_COUNT] Returning stale cache due to error: ${cachedFollowerCount}`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          count: cachedFollowerCount,
          username: TARGET_USERNAME,
          cached: true,
          stale: true,
          updatedAt: new Date(cacheTimestamp).toISOString()
        })
      };
    }
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to fetch follower count",
        message: err instanceof Error ? err.message : "Unknown error"
      })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=index.js.map
