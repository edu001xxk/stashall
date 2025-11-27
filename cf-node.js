/*
 * Cloudflare 节点生成器 (v4 自动读取版)
 * 读取存储 -> 生成 4 个节点
 */

// 1. 读取数据函数
function getData(key) {
    let val = $persistentStore.read(key);
    if (!val) return null;
    try { return JSON.parse(val); } catch(e) { return null; }
}

let def = { ip: "cf.zhetengsha.eu.org", p: "0", b: "0" };
let cm = getData("CF_DATA_CM") || def;
let ct = getData("CF_DATA_CT") || def;
let cu = getData("CF_DATA_CU") || def;
let v6 = getData("CF_DATA_V6") || def;

// 2. 你的 VLESS 配置
const uuid = "87d1bfd4-574e-4c96-ad42-0426f27461ff";
const host = "_acme-challenge.2go.cloudns.be";
const path = "/?ed=2560";

// 3. 生成函数
function createProxy(emoji, name, item) {
    let ip = item.ip;
    // IPv6 加括号修复
    if (ip.indexOf(":") > -1 && ip.indexOf("[") === -1) ip = "[" + ip + "]";
    
    // 节点名称：📱 移动 | 50ms 100M
    let nodeName = `${emoji} ${name} | ${item.p}ms ${item.b}M`;
    
    return {
        "name": nodeName,
        "type": "vless",
        "server": ip,
        "port": 443,
        "uuid": uuid,
        "tls": true,
        "skip-cert-verify": true,
        "servername": host,
        "network": "ws",
        "ws-opts": {
            "path": path,
            "headers": { "Host": host }
        },
        "udp": true
    };
}

// 4. 输出
$done({
    proxies: [
        createProxy("📱", "移动", cm),
        createProxy("🌐", "电信", ct),
        createProxy("📶", "联通", cu),
        createProxy("🦕", "IPv6", v6)
    ]
});
