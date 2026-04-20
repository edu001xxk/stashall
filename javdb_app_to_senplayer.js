// ==========================================
// JavDB 自动解析脚本 (彻底解决 App 卡死无响应问题)
// ==========================================

let body = typeof $response !== "undefined" ? $response.body : null;

if (!body) {
    $done({});
} else {
    mainLogic(body);
}

function mainLogic(body) {
    try {
        let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
        let match = body.match(idReg);

        if (match && match[1]) {
            let code = match[1].toLowerCase();
            console.log(`\n[JavDB-SenPlayer] 🔍 截获番号: ${code.toUpperCase()}`);
            
            // 启动搜索链，不再传递 originalBody，因为最后统一用 $done({}) 放行
            fetchJable(code, code, false);
        } else {
            $done({}); // 匹配不到番号，立刻原样放行
        }
    } catch (e) {
        console.log(`[JavDB-SenPlayer] ❌ 主逻辑异常: ${e}`);
        $done({}); // 发生异常，立刻原样放行
    }
}

// ==========================================
// 搜索核心：Jable
// ==========================================
function fetchJable(originalCode, targetCode, isRetry) {
    let jableUrl = `https://jable.tv/videos/${targetCode}/`;
    
    $httpClient.get({
        url: jableUrl,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        try {
            if (error || !response || response.status !== 200 || !data) {
                if (!isRetry) {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable(${targetCode}) 未找到，尝试带 -c 后缀...`);
                    fetchJable(originalCode, `${originalCode}-c`, true);
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 均无结果，转去 123AV...`);
                    fetch123AV(`https://123av.com/zh/v/${originalCode}`, originalCode, 0);
                }
                return;
            }

            let dataStr = String(data);
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = dataStr.match(m3u8Reg);

            if (m3u8Match) {
                handleSuccess(originalCode, m3u8Match[0], "Jable");
            } else {
                if (!isRetry) {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 页面无视频流，尝试带 -c 后缀...`);
                    fetchJable(originalCode, `${originalCode}-c`, true);
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 解析完毕无结果，转去 123AV...`);
                    fetch123AV(`https://123av.com/zh/v/${originalCode}`, originalCode, 0);
                }
            }
        } catch (e) {
            console.log(`[JavDB-SenPlayer] ❌ Jable 处理阶段异常: ${e}`);
            fetch123AV(`https://123av.com/zh/v/${originalCode}`, originalCode, 0);
        }
    });
}

// ==========================================
// 搜索备选：123AV
// ==========================================
function fetch123AV(url, code, step) {
    if (step > 4) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 重试耗尽，放弃搜索`);
        $done({}); // 结束脚本并原样放行
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        try {
            if (err || !resp || resp.status === 403 || resp.status === 503) {
                console.log(`[JavDB-SenPlayer] ❌ 123AV 拦截或报错，搜索结束。`);
                $done({});
                return;
            }
            
            if (resp.status >= 300 && resp.status < 400) {
                let location = resp.headers['Location'] || resp.headers['location'];
                if (location) {
                    if (location.startsWith('/')) {
                        let domainMatch = url.match(/^https?:\/\/[^\/]+/);
                        let domain = domainMatch ? domainMatch[0] : "https://123av.com";
                        location = domain + location;
                    }
                    console.log(`[JavDB-SenPlayer] 🔄 123AV 重定向: ${location}`);
                    fetch123AV(location, code, step + 1);
                } else {
                    $done({});
                }
                return;
            }

            if (resp.status === 404) {
                tryNext123AVPath(code, step);
                return;
            }
            
            if (resp.status === 200 && data) {
                let unescapedData = String(data).replace(/\\/g, "");
                let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
                let m3u8Match = unescapedData.match(m3u8Reg);

                if (m3u8Match) {
                    handleSuccess(code, m3u8Match[0], "123AV");
                    return;
                } 
                
                let videoLinkReg = new RegExp(`href="([^"]*(?:video|v|play|watch|movie)[^"]*${code}[^"]*)"`, "i");
                let linkMatch = unescapedData.match(videoLinkReg);
                
                if (linkMatch && linkMatch[1]) {
                    let nextUrl = linkMatch[1];
                    if (nextUrl.startsWith('/')) {
                        nextUrl = "https://123av.com" + nextUrl;
                    }
                    console.log(`[JavDB-SenPlayer] 🔗 找到 123AV 详情页，钻入...`);
                    fetch123AV(nextUrl, code, step + 1);
                } else {
                    tryNext123AVPath(code, step);
                }
            } else {
                $done({});
            }
        } catch (e) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 处理阶段异常: ${e}`);
            $done({});
        }
    });
}

function tryNext123AVPath(code, step) {
    if (step === 0) {
        console.log(`[JavDB-SenPlayer] 🔄 尝试 123AV 带 -c 后缀...`);
        fetch123AV(`https://123av.com/zh/v/${code}-c`, code, 1);
    } else if (step === 1) {
        console.log(`[JavDB-SenPlayer] 🔄 尝试 123AV 搜索接口...`);
        fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 2);
    } else {
        console.log(`[JavDB-SenPlayer] ❌ 所有 123AV 路径规则耗尽。`);
        $done({}); 
    }
}

function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9"
    };
}

// ==========================================
// 提取成功回调
// ==========================================
function handleSuccess(code, m3u8, source) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取 M3U8] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${m3u8}`);
    console.log(`==================================\n`);
    
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `已找到串流链接并记录至日志`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    
    // 【关键修复】使用空对象放行，不篡改响应体和编码头
    $done({});
}