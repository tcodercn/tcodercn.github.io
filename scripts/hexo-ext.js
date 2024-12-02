"use struct";

const log = require("hexo-log").default();
const fs = require("fs");
const cheerio = require("cheerio");

hexo.on("generateAfter", function () {
  const src = "source-raw";
  const dst = "public/source-raw";
  log.info("copy source folder: %s -> %s", src, dst);
  fs.cpSync(src, dst, { recursive: true });
});

hexo.extend.filter.register("after_post_render", function (data) {
  const $ = cheerio.load(data["content"]);

  var changed = false;

  $("img").each(function () {
    const src = $(this).attr("src");
    if (src) {
      const dst = `/source-raw/_posts/${src}`;
      $(this).attr("src", dst);
      log.info("change img url: %s -> %s", src, dst);
      changed = true;
    }
  });

  if (changed) {
    data["content"] = $.html();
  }
});
