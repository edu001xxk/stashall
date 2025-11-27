/*
 * Stash Proxy Provider Script (cf4节点生成 - 最终转换版)
 * 功能：从 persistentStore 读取数据，生成 4 个 Stash VLESS 节点。
 */

// 1. 读取数据 (兼容 Shadowrocket JSON 存储)
function getData(key) {
    let val = $persistentStore.read(key);
    if (!val) return null;
    try {
        // 尝试解析之前测速脚本存入的 JSON 数据 {ip, ping, bw}
        return JSON.parse(val);
    } catch(e) {
        // 如果失败，返回旧的纯 IP 字符串和默认值
        return { ip: val, p: "0", b: "0" };
    }
}

let def = { ip: "cf.zhetengsha.eu.org", p: "0", b: "0" };

// 2. 读取四个运营商数据 (读不到就用默认)
let d_cm = getData("CF_DATA_CM") || def;
let d_ct = getData("CF_DATA_CT") || def;
let d_cu = getData("CF_DATA_CU") || def;
let d_v6 = getData("CF_DATA_V6") || def;

// 3. 你的配置 (从 Shadowrocket 链接中提取)
const uuid = "87d1bfd4-574e-4c96-ad42-0426f27461ff";
const host = "_acme-challenge.2go.cloudns.be";
const path = "/?ed=2560"; 

// 4. 生成 Stash 代理对象 (Proxy Object)
function genProxy(emoji, name, item) {
    let ip = item.ip;
    
    // ⚠️ 核心修复：IPv6 地址必须加方括号
    let finalIP = ip;
    if (ip.indexOf(":") > -1 && ip.indexOf("[") === -1) {
        finalIP = `[${ip}]`;
    }

    // 节点名称格式：[Emoji] 运营商 | 50ms 100M (用于显示)
    let nodeName = `${emoji} ${name} | ${item.p}ms ${item.b}M`;
    
    // 返回 Stash VLESS 代理对象
    return {
        "name": nodeName,
        "type": "vless",
        "server": finalIP, 
        "port": 443,
        "uuid": uuid,
        "tls": true,
        "skip-cert-verify": true, // 必须开启，因为 server 是 IP
        "network": "ws",
        "servername": host,       // SNI 保持域名不变
        "ws-opts": {
            "path": path,
            "headers": {
                "Host": host
            }
        },
        "udp": true
    };
}

// 5. 组装节点列表
$done({
    proxies: [
        genProxy("📱", "移动", d_cm),
        genProxy("🌐", "电信", d_ct),
        genProxy("📶", "联通", d_cu),
        genProxy("🦕", "IPv6", d_v6)
    ]
});
