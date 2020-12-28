import fetch from 'node-fetch';
import {
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  rmdirSync
} from "fs";
import { spawn } from "child_process"
import { join } from "path"

const id = process.argv[process.argv.length-1]

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
  return new Promise(resolve => {
    console.log("Getting galleryInfo (" + id + ") ...")
    fetch("https://ltn.hitomi.la/galleries/" + id + ".js")
      .then(res => res.text())
      .then(body => {
        writeFileSync(id + ".js", body.replace("var ", "exports."))
      })
      .then(() => resolve(require("./" + id + ".js").galleryinfo))
      .then(() => unlinkSync(id + ".js"))
  })
}

function createTextOne(id, url, filename, basedir) {
  return `${url}\n        out=${basedir}/${filename}\n        header=Referer: https://hitomi.la/reader/${id}.html\n`
}

function createText(id, urls, basedir) {
  var resText = "";
  for (var c in urls) {
    resText += createTextOne(id, urls[c].url, urls[c].name, basedir)
  }
  return resText
}

function createImageList(id, basedir) {
  return new Promise(resolve => {
    getGalleryInfo(id).then(galleryinfo => {
      var urls = []
      for (var file in galleryinfo.files) {
        urls.push({
          url: url_from_url_from_hash(id, galleryinfo.files[file]),
          name: galleryinfo.files[file].name
        })
      }
      return urls
    }).then(urls=>createText(id, urls, basedir)).then(text=>{
      resolve(text)
    })
  })
}

function spawnAsync(exename, options) {
  return new Promise(resolve => {
    const ariaps = spawn(join("bin", exename), options)
    ariaps.stdout.on('data', (chunk) => console.log(chunk.toString()))
    ariaps.stderr.on('data', (chunk) => console.log(chunk.toString()))
    ariaps.on("close", ()=>resolve())
  })
}

createImageList(id, id)
.then(text => {
  if (!existsSync(`${id}`)) {
    mkdirSync(`${id}`);
  }
  writeFileSync(join(`${id}`, "list.txt"), text)
  console.log("Downloading ... ")
})
.then(() => spawnAsync("aria2c.exe", ["-i", join(`${id}`, "list.txt"), "-c", "-m", "3", "-x", "2"]))
.then(() => {
  unlinkSync(join(`${id}`, "list.txt"))
  console.log("Compressing ... ")
})
.then(() => spawnAsync("7z.exe", ["a", `${id}.zip`, `${id}`]))
.then(() => {
  console.log("Deleting cache ... ")
  rmdirSync(`${id}`, { recursive: true })
})
