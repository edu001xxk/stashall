/*
 * Cloudflare 节点生成器
 * 读取 cf.js 保存的 IP，生成动态节点
 */

// ==============================================
// 🛠️ 用户配置区域 (请修改这里！)
// ==============================================
// 这里的配置请参考你机场的 VLESS/VMESS 链接信息填入
const CONFIG = {
    name: "🚀 自动优选节点", // 节点显示的名称
    type: "vless",          // 类型: vless 或 vmess
    uuid: "87d1bfd4-574e-4c96-ad42-0426f27461ff", // 例如: 84659...
    port: 443,              // 端口，CF 通常是 443
    tls: true,              // 是否开启 TLS
    network: "ws",          // 传输协议: ws 或 grpc
    path: "/?ed=2048",      // ws 路径
    host: "_acme-challenge.2go.cloudns.be", // 你的节点域名 (Host/SNI)
    udp: true               // 是否开启 UDP
};

// ==============================================
// 逻辑区域 (不用动)
// ==============================================

// 1. 读取 cf.js 存进去的 IP
let savedIP = $persistentStore.read("CF_BEST_IP");

// 如果还没运行过优选，就用默认域名
if (!savedIP) {
    savedIP = CONFIG.host; 
    console.log("未找到优选IP，使用默认域名");
} else {
    console.log(`使用优选IP: ${savedIP}`);
}

// 2. 生成 Stash 代理配置对象
let proxy = {
    name: CONFIG.name,
    type: CONFIG.type,
    server: savedIP, // 这里把域名换成了优选IP
    port: CONFIG.port,
    uuid: CONFIG.uuid,
    tls: CONFIG.tls,
    "skip-cert-verify": true,
    servername: CONFIG.host, // 这里的 Host 依然保持原域名
    network: CONFIG.network,
    "ws-opts": {
        path: CONFIG.path,
        headers: {
            Host: CONFIG.host
        }
    },
    udp: CONFIG.udp
};

// 3. 输出给 Stash
$done({ proxies: [proxy] });
