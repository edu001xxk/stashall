/*
 * Cloudflare 节点生成器 - 纯静态调试版
 * 用于强制显示节点，排除存储读取问题
 */

try {
    // 暂时手动指定一个 IP 来测试，排除读取存储的干扰
    // 等这个能显示了，我们再把 storage 加回来
    var bestIP = "cf.zhetengsha.eu.org"; 

    var proxy = {
        "name": "🚀 自动优选 | " + bestIP,
        "type": "vless",
        "server": bestIP,
        "port": 443,
        "uuid": "87d1bfd4-574e-4c96-ad42-0426f27461ff",
        "tls": true,
        "skip-cert-verify": true,
        "network": "ws",
        "servername": "_acme-challenge.2go.cloudns.be",
        "ws-opts": {
            "path": "/?ed",
            "headers": {
                "Host": "_acme-challenge.2go.cloudns.be"
            }
        },
        "udp": true
    };

    // 直接输出
    $done({ proxies: [proxy] });

} catch (e) {
    // 如果出错，生成一个报错节点告诉我们
    $done({
        proxies: [{
            "name": "❌ 脚本报错: " + e.message,
            "type": "http",
            "server": "127.0.0.1",
            "port": 80
        }]
    });
}
