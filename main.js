"use strict";

var _nodeFetch = _interopRequireDefault(require("node-fetch"));

var _fs = require("fs");

var _child_process = require("child_process");

var _path = require("path");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var id = process.argv[process.argv.length - 1];

function subdomain_from_galleryid(g, number_of_frontends) {
  var o = g % number_of_frontends;
  return String.fromCharCode(97 + o);
}

function subdomain_from_url(url, base) {
  var retval = 'b';

  if (base) {
    retval = base;
  }

  var number_of_frontends = 3;
  var b = 16;
  var r = /\/[0-9a-f]\/([0-9a-f]{2})\//;
  var m = r.exec(url);

  if (!m) {
    return 'a';
  }

  var g = parseInt(m[1], b);

  if (!isNaN(g)) {
    if (g < 0x30) {
      number_of_frontends = 2;
    }

    if (g < 0x09) {
      g = 1;
    }

    retval = subdomain_from_galleryid(g, number_of_frontends) + retval;
  }

  return retval;
}

function url_from_url(url, base) {
  return url.replace(/\/\/..?\.hitomi\.la\//, '//' + subdomain_from_url(url, base) + '.hitomi.la/');
}

function full_path_from_hash(hash) {
  if (hash.length < 3) {
    return hash;
  }

  return hash.replace(/^.*(..)(.)$/, '$2/$1/' + hash);
}

function url_from_hash(galleryid, image, dir, ext) {
  ext = ext || dir || image.name.split('.').pop();
  dir = dir || 'images';
  return 'https://a.hitomi.la/' + dir + '/' + full_path_from_hash(image.hash) + '.' + ext;
}

function url_from_url_from_hash(galleryid, image, dir, ext, base) {
  return url_from_url(url_from_hash(galleryid, image, dir, ext), base);
}

function getGalleryInfo(id) {
  return new Promise(function (resolve) {
    console.log("Getting galleryInfo (" + id + ") ...");
    (0, _nodeFetch["default"])("https://ltn.hitomi.la/galleries/" + id + ".js").then(function (res) {
      return res.text();
    }).then(function (body) {
      (0, _fs.writeFileSync)(id + ".js", body.replace("var ", "exports."));
    }).then(function () {
      return resolve(require("./" + id + ".js").galleryinfo);
    }).then(function () {
      return (0, _fs.unlinkSync)(id + ".js");
    });
  });
}

function createTextOne(id, url, filename, basedir) {
  return "".concat(url, "\n        out=").concat(basedir, "/").concat(filename, "\n        header=Referer: https://hitomi.la/reader/").concat(id, ".html\n");
}

function createText(id, urls, basedir) {
  var resText = "";

  for (var c in urls) {
    resText += createTextOne(id, urls[c].url, urls[c].name, basedir);
  }

  return resText;
}

function createImageList(id, basedir) {
  return new Promise(function (resolve) {
    getGalleryInfo(id).then(function (galleryinfo) {
      var urls = [];

      for (var file in galleryinfo.files) {
        urls.push({
          url: url_from_url_from_hash(id, galleryinfo.files[file]),
          name: galleryinfo.files[file].name
        });
      }

      return urls;
    }).then(function (urls) {
      return createText(id, urls, basedir);
    }).then(function (text) {
      resolve(text);
    });
  });
}

function spawnAsync(exename, options) {
  return new Promise(function (resolve) {
    var ariaps = (0, _child_process.spawn)((0, _path.join)("bin", exename), options);
    ariaps.stdout.on('data', function (chunk) {
      return console.log(chunk.toString());
    });
    ariaps.stderr.on('data', function (chunk) {
      return console.log(chunk.toString());
    });
    ariaps.on("close", function () {
      return resolve();
    });
  });
}

createImageList(id, id).then(function (text) {
  if (!(0, _fs.existsSync)("".concat(id))) {
    (0, _fs.mkdirSync)("".concat(id));
  }

  (0, _fs.writeFileSync)((0, _path.join)("".concat(id), "list.txt"), text);
  console.log("Downloading ... ");
}).then(function () {
  return spawnAsync("aria2c.exe", ["-i", (0, _path.join)("".concat(id), "list.txt"), "-c"]);
}).then(function () {
  (0, _fs.unlinkSync)((0, _path.join)("".concat(id), "list.txt"));
  console.log("Compressing ... ");
}).then(function () {
  return spawnAsync("7z.exe", ["a", "".concat(id, ".zip"), "".concat(id)]);
}).then(function () {
  console.log("Deleting cache ... ");
  (0, _fs.rmdirSync)("".concat(id), {
    recursive: true
  });
});
