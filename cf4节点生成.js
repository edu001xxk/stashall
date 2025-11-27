/*
 * Shadowrocket 订阅生成器 (v3 修复IPv6格式版)
 * 修复：IPv6地址必须加 [] 才能被识别的问题
 */

// 1. 读取数据
function getData(key) {
    let val = $persistentStore.read(key);
    if (!val) return null;
    try {
        return JSON.parse(val);
    } catch(e) {
        return { ip: val, ping: "0", bw: "0" };
    }
}

let def = { ip: "cf.zhetengsha.eu.org", ping: "0", bw: "0" };
// 如果没数据，默认全部用保底，保证显示4个
let d_cm = getData("CF_DATA_CM") || def;
let d_ct = getData("CF_DATA_CT") || def;
let d_cu = getData("CF_DATA_CU") || def;
let d_v6 = getData("CF_DATA_V6") || def;

// 2. 你的配置
const uuid = "87d1bfd4-574e-4c96-ad42-0426f27461ff";
const host = "_acme-challenge.2go.cloudns.be";
const path = "/?ed=2560"; 

// 3. 生成链接 (关键修复)
function genLink(emoji, name, item, id) {
    let ip = item.ip;
    
    // ⚠️ 核心修复：如果是 IPv6 (包含冒号)，必须加 []
    let finalIP = ip;
    if (ip.indexOf(":") > -1 && ip.indexOf("[") === -1) {
        finalIP = `[${ip}]`;
    }

    let nodeName = `${emoji} ${name} | ${item.ping}ms ${item.bw}M`;
    let n = encodeURIComponent(nodeName);
    let p = encodeURIComponent(path);
    
    return `vless://${uuid}@${finalIP}:443?encryption=none&security=tls&type=ws&host=${host}&path=${p}&sni=${host}&unique=${id}#${n}`;
}

let links = [];
links.push(genLink("📱", "移动", d_cm, "cm"));
links.push(genLink("🌐", "电信", d_ct, "ct"));
links.push(genLink("📶", "联通", d_cu, "cu"));
links.push(genLink("🦕", "IPv6", d_v6, "v6")); 

// 4. 输出
let finalStr = links.join("\n");
const Base64={encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(s)+"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(o)+"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(u)+"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(a)}return t},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t}};
let body = Base64.encode(finalStr);

$done({
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: body
});