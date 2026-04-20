// ==========================================
// JavDB 自动解析脚本 (终极防崩溃增强版)
// ==========================================

let body = typeof $response !== "undefined" ? $response.body : null;

// 1. 如果没有抓到数据，立刻放行，绝不卡顿
if (!body) {
    $done({});
} else {
    mainLogic(body);
}

// 2. 主逻辑入口 (加入容错保护)
function mainLogic(body) {
    try {
        let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
        let match = body.match(idReg);

        if (match && match[1]) {
            let code = match[1].toLowerCase();
            console.log(`\n[JavDB-SenPlayer] 🔍 截获番号: ${code.toUpperCase()}`);
            
            // 启动搜索链：传入原始番号、目标番号、是否为重试、原始body
            fetchJable(code, code, false, body);
        } else {
            $done({ body });
        }
    } catch (e) {
        console.log(`[JavDB-SenPlayer] ❌ 主逻辑异常崩溃: ${e}`);
        // 发生任何意外，立刻返回原始数据给 App
        $done({ body });
    }
}

// ==========================================
// 搜索核心：Jable
// ==========================================
function fetchJable(originalCode, targetCode, isRetry, originalBody) {
    let jableUrl = `https://jable.tv/videos/${targetCode}/`;
    
    $httpClient.get({
        url: jableUrl,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        try {
            // 如果网络报错或非 200 状态
            if (error || !response || response.status !== 200 || !data) {
                if (!isRetry) {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable(${targetCode}) 未找到，尝试带 -c 后缀...`);
                    fetchJable(originalCode, `${originalCode}-c`, true, originalBody);
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 均无结果，转去 123AV...`);
                    fetch123AV(`https://123av.com/zh/v/${originalCode}`, originalCode, 0, originalBody);
                }
                return;
            }

            // 成功请求到页面
            let dataStr = String(data);
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = dataStr.match(m3u8Reg);

            if (m3u8Match) {
                handleSuccess(originalCode, m3u8Match[0], "Jable", originalBody);
            } else {
                if (!isRetry) {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 页面无视频流，尝试带 -c 后缀...`);
                    fetchJable(originalCode, `${originalCode}-c`, true, originalBody);
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 解析完毕无结果，转去 123AV...`);
                    fetch123AV(`https://123av.com/zh/v/${originalCode}`, originalCode, 0, originalBody);
                }
            }
        } catch (e) {
            console.log(`[JavDB-SenPlayer] ❌ Jable 处理阶段崩溃: ${e}`);
            fetch123AV(`https://123av.com/zh/v/${originalCode}`, originalCode, 0, originalBody);
        }
    });
}

// ==========================================
// 搜索备选：123AV
// ==========================================
function fetch123AV(url, code, step, originalBody) {
    if (step > 4) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 重试次数耗尽，放弃搜索`);
        $done({ body: originalBody });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        try {
            if (err || !resp || resp.status === 403 || resp.status === 503) {
                console.log(`[JavDB-SenPlayer] ❌ 123AV 被墙或拦截，搜索结束。`);
                $done({ body: originalBody });
                return;
            }
            
            // 处理重定向
            if (resp.status >= 300 && resp.status < 400) {
                let location = resp.headers['Location'] || resp.headers['location'];
                if (location) {
                    if (location.startsWith('/')) {
                        let domainMatch = url.match(/^https?:\/\/[^\/]+/);
                        let domain = domainMatch ? domainMatch[0] : "https://123av.com";
                        location = domain + location;
                    }
                    console.log(`[JavDB-SenPlayer] 🔄 123AV 跟随重定向: ${location}`);
                    fetch123AV(location, code, step + 1, originalBody);
                } else {
                    $done({ body: originalBody });
                }
                return;
            }

            // 处理 404
            if (resp.status === 404) {
                tryNext123AVPath(code, step, originalBody);
                return;
            }
            
            // 处理成功页面
            if (resp.status === 200 && data) {
                let unescapedData = String(data).replace(/\\/g, "");
                let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
                let m3u8Match = unescapedData.match(m3u8Reg);

                if (m3u8Match) {
                    handleSuccess(code, m3u8Match[0], "123AV", originalBody);
                    return;
                } 
                
                // 尝试找详情页链接
                let videoLinkReg = new RegExp(`href="([^"]*(?:video|v|play|watch|movie)[^"]*${code}[^"]*)"`, "i");
                let linkMatch = unescapedData.match(videoLinkReg);
                
                if (linkMatch && linkMatch[1]) {
                    let nextUrl = linkMatch[1];
                    if (nextUrl.startsWith('/')) {
                        nextUrl = "https://123av.com" + nextUrl;
                    }
                    console.log(`[JavDB-SenPlayer] 🔗 找到 123AV 内部详情页，继续钻入...`);
                    fetch123AV(nextUrl, code, step + 1, originalBody);
                } else {
                    tryNext123AVPath(code, step, originalBody);
                }
            } else {
                $done({ body: originalBody });
            }
        } catch (e) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 处理阶段崩溃: ${e}`);
            $done({ body: originalBody });
        }
    });
}

// ==========================================
// 辅助路由：123AV 的多路径探测
// ==========================================
function tryNext123AVPath(code, step, originalBody) {
    if (step === 0) {
        console.log(`[JavDB-SenPlayer] 🔄 尝试 123AV 带 -c 后缀的视频路径...`);
        fetch123AV(`https://123av.com/zh/v/${code}-c`, code, 1, originalBody);
    } else if (step === 1) {
        console.log(`[JavDB-SenPlayer] 🔄 尝试 123AV 搜索接口...`);
        fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 2, originalBody);
    } else {
        console.log(`[JavDB-SenPlayer] ❌ 所有已知 123AV 路径规则均已耗尽，提取失败。`);
        $done({ body: originalBody }); 
    }
}

// ==========================================
// 通用配置与成功回调
// ==========================================
function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9"
    };
}

function handleSuccess(code, m3u8, source, originalBody) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取 M3U8] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${m3u8}`);
    console.log(`==================================\n`);
    
    // 继续保留您使用的 Shortcuts 快捷指令唤醒方式
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `已找到串流链接并记录至日志`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    
    // 关键：放行原始请求，允许 App 正常加载详情内容
    $done({ body: originalBody });
}