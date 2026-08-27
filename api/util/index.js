const config = require('./config.json');
const { apiver, appid, wx_appid, wx_lite_appid, srcappid, clientver, liteAppid, liteClientver } = config;
// 微信密钥仅从环境变量注入，不再写入仓库（config.json 已移除明文）。
// 本地开发：在 api/.env 中配置 KUGOU_WX_SECRET / KUGOU_WX_LITE_SECRET；
// GitHub Actions：在仓库 Secrets 中配置同名变量并由 workflow 注入。
const wx_secret = process.env.KUGOU_WX_SECRET;
const wx_lite_secret = process.env.KUGOU_WX_LITE_SECRET;
const {
  cryptoAesDecrypt,
  cryptoAesEncrypt,
  cryptoMd5,
  cryptoRSAEncrypt,
  cryptoSha1,
  rsaEncrypt2,
  playlistAesEncrypt,
  playlistAesDecrypt,
  publicLiteRasKey,
  publicRasKey,
} = require('./crypto');
const { createRequest } = require('./request');
const { signKey, signParams, signParamsKey, signCloudKey, signatureAndroidParams, signatureRegisterParams, signatureWebParams } = require('./helper');
const { randomString, decodeLyrics, parseCookieString, cookieToJson } = require('./util');

// 判断是否为概念版
const isLite = process.env.platform === 'lite';
const useAppid = isLite ? liteAppid : appid;
const useClientver = isLite ? liteClientver : clientver;

module.exports = {
  apiver,
  appid: useAppid,
  // liteAppid,
  // liteClientver,
  wx_appid,
  wx_lite_appid,
  wx_secret,
  wx_lite_secret,
  srcappid,
  clientver: useClientver,
  isLite,
  cryptoAesDecrypt,
  cryptoAesEncrypt,
  cryptoMd5,
  cryptoRSAEncrypt,
  cryptoSha1,
  rsaEncrypt2,
  playlistAesEncrypt,
  playlistAesDecrypt,
  createRequest,
  signKey,
  signParams,
  signParamsKey,
  signCloudKey,
  signatureAndroidParams,
  signatureRegisterParams,
  signatureWebParams,
  randomString,
  decodeLyrics,
  parseCookieString,
  cookieToJson,
  publicLiteRasKey,
  publicRasKey,
};
