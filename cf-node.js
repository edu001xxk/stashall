/*
 * Cloudflare 节点生成器 - 修复版 (VLESS专用)
 * 基于用户提供的配置：cf.zhetengsha.eu.org / _acme-challenge.2go.cloudns.be
 */

// 1. 读取优选 IP
// 如果还没有运行过优选脚本，默认使用原来的域名作为“保底”
let savedIP = $persistentStore.read("CF_BEST_IP");
let address = savedIP ? savedIP : "cf.zhetengsha.eu.org";

// 2. 构建 Stash 代理对象
// 这里完全照搬了你提供的 VLESS 格式
let proxy = {
    "name": "🚀 自动优选 | " + (savedIP ? "已启用" : "默认"),
    "type": "vless",
    "server": address,  // 这里动态替换为优选IP
    "port": 443,
    "uuid": "87d1bfd4-574e-4c96-ad42-0426f27461ff",
    "tls": true,
    "skip-cert-verify": true,
    "servername": "_acme-challenge.2go.cloudns.be", // 固定死，不能变
    "network": "ws",
    "ws-opts": {
        "path": "/?ed",
        "headers": {
            "Host": "_acme-challenge.2go.cloudns.be" // 固定死，不能变
        }
    },
    "udp": true
};

// 调试日志：让你知道这次生成用了哪个IP
console.log(`[节点生成] 正在使用IP: ${address}`);

// 3. 输出给 Stash
$done({ proxies: [proxy] });
