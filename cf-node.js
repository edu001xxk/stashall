/*
 * Cloudflare 节点生成器 - 绝对防呆版
 * 无论如何都会输出一个节点，防止 Stash 显示 0
 */

// 1. 尝试读取优选 IP，读不到就用默认的
let savedIP = $persistentStore.read("CF_BEST_IP");
let address = "cf.zhetengsha.eu.org"; // 默认地址

if (savedIP && savedIP.length > 6 && savedIP.indexOf(".") > -1) {
    address = savedIP;
    console.log("✅ [CF生成] 使用优选IP: " + address);
} else {
    console.log("⚠️ [CF生成] 未找到优选IP，使用默认域名");
}

// 2. 构建节点 (严格 JSON 格式)
let proxy = {
    name: "🚀 自动优选 | " + address,
    type: "vless",
    server: address,
    port: 443,
    uuid: "87d1bfd4-574e-4c96-ad42-0426f27461ff",
    tls: true,
    "skip-cert-verify": true,
    servername: "_acme-challenge.2go.cloudns.be",
    network: "ws",
    "ws-opts": {
        path: "/?ed",
        headers: {
            Host: "_acme-challenge.2go.cloudns.be"
        }
    },
    udp: true
};

// 3. 输出 (使用最原始的 return 方式，兼容性最强)
$done({ proxies: [proxy] });
