let body = $response.body; // 注意这里把你的 Let 改成了规范的小写 let

if (!body) {
    $done({});
    return; // 补上一个 return，防止 body 为空时导致下方正则报错卡死
}

// 1. 匹配标准番号
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

    let jableUrl = `https://jable.tv/videos/${code}/`;

    // 2. 优先请求 Jable
    $httpClient.get({
        url: jableUrl,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        let foundM3u8 = false;

        // 增加了 response 的判空，防止偶发网络断开时报错
        if (!error && response && response.status === 200) {
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = data ? data.match(m3u8Reg) : null;
            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }
        
        // 3. 备用方案：Jable没找到，转而搜索 123AV
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到或被拦截，转去 123AV...`);
            // 首选尝试 123AV 的直接播放路径
            fetch123AV(`https://123av.com/zh/v/${code}`, code, 0);
        }
    });
} else {
    $done({ body });
}

// ==========================================
// 核心：处理 123AV 请求与 CF 盾诊断
// ==========================================
function fetch123AV(url, code, redirectCount) {
    if (redirectCount > 3) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 重定向/重试次数过多，已停止请求`);
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 网络请求直接报错: ${err}`);
            $done({ body });
            return;
        }
        
        if (!resp) {
            $done({ body });
            return;
        }
        
        // 【CF 盾检测】
        if (resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] 🛡️ 遭遇 CF 盾拦截！状态码: ${resp.status}，脚本无法绕过此级别防御。`);
            $done({ body });
            return;
        }
        
        // 处理重定向
        if (resp.status === 301 || resp.status === 302 || resp.status === 308) {
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) {
                    let domain = url.match(/^https?:\/\/[^\/]+/)[0];
                    location = domain + location;
                }
                console.log(`[JavDB-SenPlayer] 🔄 自动跟随重定向至: ${location}`);
                fetch123AV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        // 如果成功获取网页
        if (resp.status === 200) {
            let unescapedData = data ? data.replace(/\\/g, "") : "";
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match) {
                handleSuccess(code, m3u8Match[0], "123AV");
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 123AV (状态码200) 未找到m3u8。`);
                
                if (redirectCount === 0) {
                    console.log(`[JavDB-SenPlayer] 尝试使用搜索接口...`);
                    // 备选尝试 123AV 的搜索路径
                    fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 1);
                } else {
                    $done({ body });
                }
            }
        } 
        // 兼容 123AV 常见的 404 错误
        else if (resp.status === 404) {
            console.log(`[JavDB-SenPlayer] ⚠️ 123AV 遇到404。`);
            if (redirectCount === 0) {
                console.log(`[JavDB-SenPlayer] 尝试使用带 -c 后缀的视频路径...`);
                // 123AV 有时会在番号后加 -c
                fetch123AV(`https://123av.com/zh/v/${code}-c`, code, 1);
            } else {
                $done({ body });
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 未知错误，状态码: ${resp.status}`);
            $done({ body });
        }
    });
}

// ==========================================
// 伪装请求头（尝试欺骗防爬虫策略）
// ==========================================
function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Connection": "keep-alive"
    };
}

// ==========================================
// 提取成功后的处理函数
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
    $done({ body });
}