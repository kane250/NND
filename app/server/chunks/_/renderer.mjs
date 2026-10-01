import { e as eventHandler } from '../nitro/nitro.mjs';
import 'node:crypto';
import 'node:path';
import 'node:fs';
import 'better-sqlite3';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:url';
import 'consola';
import 'node:process';
import 'jose';

// ROLLUP_NO_REPLACE 
 const template = "<!doctype html>\n<html lang=\"zh-CN\" class=\"dark\">\n\n<head>\n  <meta charset=\"UTF-8\" />\n  <link rel=\"icon\" type=\"image/svg+xml\" href=\"/icon.svg\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <!-- SEO Meta Tags -->\n  <meta name=\"description\" content=\"NewsNow - 实时新闻聚合阅读器，汇集全球热点新闻，提供优雅的阅读体验\" />\n  <meta name=\"keywords\" content=\"新闻,科技新闻,实时新闻,新闻聚合,NewsNow\" />\n  <meta name=\"author\" content=\"NewsNow\" />\n  <meta name=\"robots\" content=\"index, follow\" />\n\n  <!-- Open Graph Meta Tags -->\n  <meta property=\"og:title\" content=\"NewsNow - 优雅的新闻聚合阅读器\" />\n  <meta property=\"og:description\" content=\"实时新闻聚合阅读器，汇集全球热点新闻，提供优雅的阅读体验\" />\n  <meta property=\"og:type\" content=\"website\" />\n  <meta property=\"og:url\" content=\"https://newsnow.busiyi.world\" />\n  <meta property=\"og:image\" content=\"https://newsnow.busiyi.world/og-image.png\" />\n\n  <!-- Twitter Card Meta Tags -->\n  <meta name=\"twitter:card\" content=\"summary_large_image\" />\n  <meta name=\"twitter:title\" content=\"NewsNow - 优雅的新闻聚合阅读器\" />\n  <meta name=\"twitter:description\" content=\"实时新闻聚合阅读器，汇集全球热点新闻，提供优雅的阅读体验\" />\n  <meta name=\"twitter:image\" content=\"https://newsnow.busiyi.world/og-image.svg\" />\n\n  <meta name=\"theme-color\" content=\"#F14D42\" />\n  <link rel=\"preload\" href=\"/Baloo2-Bold.subset.ttf\" as=\"font\" type=\"font/ttf\" crossorigin>\n  <link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\" sizes=\"180x180\" />\n\n  <!-- Schema.org markup for Google -->\n  <script type=\"application/ld+json\">\n    {\n      \"@context\": \"https://schema.org\",\n      \"@type\": \"WebSite\",\n      \"name\": \"NewsNow\",\n      \"url\": \"https://newsnow.busiyi.world\",\n      \"description\": \"实时新闻聚合阅读器，汇集全球热点新闻，提供优雅的阅读体验\",\n    }\n  </script>\n\n  <!-- Google Analytics -->\n  <script async src=\"https://www.googletagmanager.com/gtag/js?id=G-EL9HHYE5LC\"></script>\n  <script>\n    window.dataLayer = window.dataLayer || [];\n    function gtag() { dataLayer.push(arguments); }\n    gtag('js', new Date());\n    gtag('config', 'G-EL9HHYE5LC');\n  </script>\n\n  <script>\n    const query = new URLSearchParams(window.location.search)\n    if (query.has(\"login\") && query.has(\"user\") && query.has(\"jwt\")) {\n      localStorage.setItem(\"user\", query.get(\"user\"))\n      localStorage.setItem(\"jwt\", JSON.stringify(query.get(\"jwt\")))\n      window.history.replaceState({}, document.title, window.location.pathname)\n    }\n  </script>\n  <title>NewsNow</title>\n  <script type=\"module\" crossorigin src=\"/assets/index-1YMRdJ5k.js\"></script>\n  <link rel=\"stylesheet\" crossorigin href=\"/assets/index-D0I4jTJu.css\">\n<link rel=\"manifest\" href=\"/manifest.webmanifest\"></head>\n\n<body>\n  <div id=\"app\"></div>\n</body>\n\n</html>";

const renderer = eventHandler(async () => {
  return template;
});

export { renderer as default };
