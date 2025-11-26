/*
 * Cloudflare 节点生成器 - 强力修复版
 * 包含 try-catch 错误捕获，确保 100% 输出节点
 */

try {
    // 1. 读取优选 IP (如果没有，强制使用默认域名)
    let savedIP = $persistentStore.read("CF_BEST_IP");
    // 简单的 IP 格式校验，防止读到空值或乱码
    if (!savedIP || savedIP.length < 7) {
        savedIP = "cf.zhetengsha.eu.org";
        console.log("[CF生成] 未读取到有效IP，使用默认域名");
    } else {
        console.log(`[CF生成] 使用优选IP: ${savedIP}`);
    }

    // 2. 构建 VLESS 节点 (严格对照你提供的 JSON)
    let proxy = {
        "name": "🚀 自动优选 | " + savedIP,
        "type": "vless",
        "server": savedIP, // 这里填优选 IP
        "port": 443,
        "uuid": "87d1bfd4-574e-4c96-ad42-0426f27461ff",
        "tls": true,
        "skip-cert-verify": true,
        "servername": "_acme-challenge.2go.cloudns.be",
        "network": "ws",
        "ws-opts": {
            "path": "/?ed",
            "headers": {
                "Host": "_acme-challenge.2go.cloudns.be"
            }
        },
        "udp": true
    };

    // 3. 输出结果
    $done({ proxies: [proxy] });

} catch (e) {
    console.log(`[CF生成] 脚本严重错误: ${e.message}`);
    // 发生错误时，返回一个空的，防止 Stash 卡死
    $done({ proxies: [] });
}
