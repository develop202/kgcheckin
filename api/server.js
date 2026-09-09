const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const decode = require('safe-decode-uri-component');
const { cookieToJson } = require('./util/util');
const { createRequest } = require('./util/request');
const dotenv = require('dotenv');
const cache = require('./util/apicache').middleware;

const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'vip_token',
  'viptoken',
  'cookie',
  'authorization',
  'code',
  'mobile',
  'phone',
  'qrcode',
  'qrcode_img',
  'qrcode_txt',
  'qrimg',
  'key',
  'p',
  'p2',
  'p3',
  'params',
]);

const IDENTIFIER_QUERY_KEYS = new Set(['userid', 'user_id', 'uid', 'kguid', 'kugouid', 't_userid']);
const DISPLAY_NAME_KEYS = new Set(['nickname', 'username', 'display_name', 'displayname']);
const SENSITIVE_BODY_KEYS = new Set([
  ...SENSITIVE_QUERY_KEYS,
  'pat',
  'gh_token',
  'userinfo',
  'password',
]);

function maskIdentifierForLog(value) {
  const chars = Array.from(String(value ?? ''));

  if (chars.length === 0) return '';
  if (chars.length <= 2) return '*'.repeat(chars.length);
  if (chars.length <= 6) return `${chars[0]}***${chars[chars.length - 1]}`;
  return `${chars.slice(0, 3).join('')}***${chars.slice(-2).join('')}`;
}

function sanitizeUrlForLog(rawUrl) {
  const decodedUrl = decode(rawUrl || '');
  const queryStart = decodedUrl.indexOf('?');

  if (queryStart === -1) {
    return decodedUrl;
  }

  const pathName = decodedUrl.slice(0, queryStart);
  const queryString = decodedUrl.slice(queryStart + 1);

  const params = new URLSearchParams(queryString);
  for (const key of Array.from(params.keys())) {
    const normalizedKey = key.toLowerCase();
    if (IDENTIFIER_QUERY_KEYS.has(normalizedKey)) {
      params.set(key, maskIdentifierForLog(params.get(key)));
    } else if (SENSITIVE_QUERY_KEYS.has(normalizedKey)) {
      params.set(key, '[REDACTED]');
    }
  }

  const sanitizedQuery = params.toString().replace(/%5BREDACTED%5D/g, '[REDACTED]');
  return sanitizedQuery ? `${pathName}?${sanitizedQuery}` : pathName;
}

function maskDisplayNameForLog(value) {
  const chars = Array.from(String(value ?? ''));

  if (chars.length === 0) return '';
  if (chars.length === 1) return `${chars[0]}********`;
  if (chars.length === 2) return `${chars[0]}********${chars[1]}`;
  return `${chars.slice(0, 2).join('')}********${chars[chars.length - 1]}`;
}

function sanitizeStringForLog(value) {
  return String(value)
    .replace(/(github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]{20,})/g, '[REDACTED]')
    .replace(/(?<!\d)(1[3-9]\d{9})(?!\d)/g, (phone) => `${phone.slice(0, 2)}*******${phone.slice(-2)}`);
}

function sanitizeBodyForLog(value, depth = 0) {
  if (value == null) return value;
  if (typeof value !== 'object') {
    return typeof value === 'string' ? sanitizeStringForLog(value) : value;
  }
  if (depth >= 4) return '[Object]';
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeBodyForLog(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const normalizedKey = key.toLowerCase();
      if (DISPLAY_NAME_KEYS.has(normalizedKey)) {
        return [key, maskDisplayNameForLog(item)];
      }
      if (IDENTIFIER_QUERY_KEYS.has(normalizedKey)) {
        return [key, maskIdentifierForLog(item)];
      }
      if (SENSITIVE_BODY_KEYS.has(normalizedKey)) {
        return [key, '[REDACTED]'];
      }
      return [key, sanitizeBodyForLog(item, depth + 1)];
    })
  );
}

/**
 * @typedef {{
 * identifier?: string,
 * route: string,
 * module: any,
 * }}ModuleDefinition
 */

/**
 * @typedef {{
 *  server?: import('http').Server,
 * }} ExpressExtension
 */

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
}

/**
 *  描述：动态获取模块定义
 * @param {string}  modulesPath  模块路径(TS)
 * @param {Record<string, string>} specificRoute  特定模块定义
 * @param {boolean} doRequire  如果为 true，则使用 require 加载模块, 否则打印模块路径， 默认为true
 * @return { Promise<ModuleDefinition[]> }
 * @example getModuleDefinitions("./module", {"album_new.js": "/album/create"})
 */
async function getModulesDefinitions(modulesPath, specificRoute, doRequire = true) {
  const files = await fs.promises.readdir(modulesPath);
  const parseRoute = (fileName) =>
    specificRoute && fileName in specificRoute ? specificRoute[fileName] : `/${fileName.replace(/\.(js)$/i, '').replace(/_/g, '/')}`;

  return files
    .reverse()
    .filter((fileName) => fileName.endsWith('.js') && !fileName.startsWith('_'))
    .map((fileName) => {
      const identifier = fileName.split('.').shift();
      const route = parseRoute(fileName);
      const modulePath = path.resolve(modulesPath, fileName);
      const module = doRequire ? require(modulePath) : modulePath;
      return { identifier, route, module };
    });
}

/**
 * 创建服务
 * @param {ModuleDefinition[]} moduleDefs
 * @return {Promise<import('express').Express>}
 */
async function consturctServer(moduleDefs) {
  const app = express();
  const { CORS_ALLOW_ORIGIN } = process.env;
  // 默认仅允许本机来源，避免反射任意 Origin 带来的 CSRF/凭据泄露风险；
  // 仅当显式配置 CORS_ALLOW_ORIGIN 时才放宽，并仅在配置时允许凭据。
  const allowOrigin = CORS_ALLOW_ORIGIN || 'http://127.0.0.1:3000';
  app.set('trust proxy', true);

  /**
   * CORS & Preflight request
   */
  app.use((req, res, next) => {
    if (req.path !== '/' && !req.path.includes('.')) {
      res.set({
        'Access-Control-Allow-Credentials': !!CORS_ALLOW_ORIGIN,
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'Authorization,X-Requested-With,Content-Type,Cache-Control',
        'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
    req.method === 'OPTIONS' ? res.status(204).end() : next();
  });

  // Cookie Parser
  app.use((req, _, next) => {
    req.cookies = {};
    (req.headers.cookie || '').split(/;\s+|(?<!\s)\s+$/g).forEach((pair) => {
      const crack = pair.indexOf('=');
      if (crack < 1 || crack === pair.length - 1) {
        return;
      }
      req.cookies[decode(pair.slice(0, crack)).trim()] = decode(pair.slice(crack + 1)).trim();
    });
    next();
  });

  // 将当前平台写入Cookie 以方便查看
  app.use((req, res, next) => {
    const cookies = (req.headers.cookie || '').split(/;\s+|(?<!\s)\s+$/g);
    if (!cookies.includes('KUGOU_API_PLATFORM')) {
      if (req.protocol === 'https') {
        res.append('Set-Cookie', `KUGOU_API_PLATFORM=${process.env.platform}; PATH=/; SameSite=None; Secure`);
      } else {
        res.append('Set-Cookie', `KUGOU_API_PLATFORM=${process.env.platform}; PATH=/`);
      }
    }

    next();
  });

  // Body Parser
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  /**
   * Serving static files
   */
  app.use(express.static(path.join(__dirname, 'public')));

  /**
   * docs
   */

  app.use('/docs', express.static(path.join(__dirname, 'docs')));

  // Cache
  app.use(cache('2 minutes', (_, res) => res.statusCode === 200));

  const moduleDefinitions = moduleDefs || (await getModulesDefinitions(path.join(__dirname, 'module'), {}));

  for (const moduleDef of moduleDefinitions) {
    app.use(moduleDef.route, async (req, res) => {
      [req.query, req.body].forEach((item) => {
        if (typeof item.cookie === 'string') {
          item.cookie = cookieToJson(decode(item.cookie));
        }
      });

      const { cookie, ...params } = req.query;

      // 将 query.cookie 规整为对象后再合并：字符串走 cookieToJson，对象原样，其余视为空；
      // 同时用新对象合并，避免直接 mutate req.cookies 以及字符串/数组直接 Object.assign 导致的键污染
      const cookieSource = typeof cookie === 'string'
        ? cookieToJson(cookie)
        : (cookie && !Array.isArray(cookie) && typeof cookie === 'object' ? cookie : {});
      const query = Object.assign(
        {},
        { cookie: Object.assign({}, req.cookies, cookieSource) },
        params,
        { body: req.body }
      );

      const authHeader = req.headers['authorization'];
      if (authHeader) {
        query.cookie = {
          ...query.cookie,
          ...cookieToJson(authHeader),
        };
      }
      try {
        const moduleResponse = await moduleDef.module(query, (config) => {
          let ip = req.ip;
          if (ip.substring(0, 7) === '::ffff:') {
            ip = ip.substring(7);
          }
          config.ip = ip;
          return createRequest(config);
        });

        console.log('[OK]', sanitizeUrlForLog(req.originalUrl));

        const cookies = moduleResponse.cookie;
        if (!query.noCookie) {
          if (Array.isArray(cookies) && cookies.length > 0) {
            if (req.protocol === 'https') {
              // Try to fix CORS SameSite Problem
              res.append(
                'Set-Cookie',
                cookies.map((cookie) => {
                  return `${cookie}; PATH=/; SameSite=None; Secure`;
                })
              );
            } else {
              res.append(
                'Set-Cookie',
                cookies.map((cookie) => {
                  return `${cookie}; PATH=/`;
                })
              );
            }
          }
        }

        res.header(moduleResponse.headers).status(moduleResponse.status).send(moduleResponse.body);
      } catch (e) {
        const moduleResponse = e;
        console.log('[ERR]', sanitizeUrlForLog(req.originalUrl), {
          status: moduleResponse.status,
          body: sanitizeBodyForLog(moduleResponse.body),
        });

        if (!moduleResponse.body) {
          res.status(404).send({
            code: 404,
            data: null,
            msg: 'Not Found',
          });
          return;
        }

        res.header(moduleResponse.headers).status(moduleResponse.status).send(moduleResponse.body);
      }
    });
  }

  return app;
}

/**
 * Serve the KG API
 * @returns {Promise<import('express').Express & ExpressExtension>}
 */
async function startService() {
  const port = Number(process.env.PORT || '3000');
  const host = process.env.HOST || '127.0.0.1';

  const app = await consturctServer();

  /** @type {import('express').Express & ExpressExtension} */
  const appExt = app;

  appExt.service = app.listen(port, host, () => {
    console.log(`server running @ http://${host || 'localhost'}:${port}`);
  });

  return appExt;
}

module.exports = { startService, getModulesDefinitions };
