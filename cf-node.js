/*
 * Cloudflare 节点生成器 - 截图同款格式版
 * 严格参照 SG🇸🇬-SAP_xia_argo 节点结构
 */

// 1. 读取优选 IP
// 如果没读到，默认使用截图里的 cf.090227.xyz
var savedIP = $persistentStore.read("CF_BEST_IP");
var address = (savedIP && savedIP.length > 5) ? savedIP : "cf.090227.xyz";

// 2. 定义配置 (来自你的截图)
// 请核对 UUID 和 Host 是否需要修改，这里默认用了截图里的
var config = {
    uuid: "87d1bfd4-574e-4c96-ad42-0426f27461ff",
    host: "writede.txia363.nyc.mn",
    path: "/vless-argo?ed"
};

// 3. 构建节点对象
// ⚠️ 结构严格对应截图中的 JSON 格式
var proxy = {
    "type": "vless",
    "name": "🚀 自动优选 | " + address,
    "server": address,           // 动态 IP
    "port": 443,
    "uuid": config.uuid,
    "tls": true,
    "skip-cert-verify": true,    // 优选 IP 必须开启跳过证书验证
    "network": "ws",
    "servername": config.host,   // 对应截图中的 servername
    "ws-opts": {
        "path": config.path,     // 对应截图中的 path
        "headers": {
            "Host": config.host  // 对应截图中的 headers.Host
        }
    },
    "udp": true
};

// 4. 输出给 Stash
$done({ proxies: [proxy] });
