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
const ids = process.argv.slice(2)
var filename = {};


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

function _arg_to_id(url) {
  return (url.match(/^[0-9]*$/)||(new URL(url)).pathname.match(/([0-9]*)\.html/).slice(1))[0]
}

function arg_to_id(url) {
  return (url.match(/^[0-9]+(#[0-9]+:[0-9]+)?$/)||(new URL(url)).pathname.match(/([0-9]*)\.html/).slice(1))[0]
}

function args_to_ids(args) {
  var res = []
  for (var arg in args) {
    res.push(arg_to_id(args[arg]))
  }
  return res
}

function getGalleryInfo(id) {
  return new Promise(resolve => {
    console.log("Getting galleryInfo (" + id.match(/[0-9]+/)[0] + ") ...")
    fetch("https://ltn.hitomi.la/galleries/" + id.match(/[0-9]+/)[0] + ".js")
      .then(res => res.text())
      .then(body => {
        writeFileSync(id.match(/[0-9]+/)[0] + ".js", body.replace("var ", "exports."))
      })
      .then(() => resolve(require("./" + id.match(/[0-9]+/)[0] + ".js").galleryinfo))
      .then(() => unlinkSync(id.match(/[0-9]+/)[0] + ".js"))
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
      filename[id.match(/[0-9]+/)[0]] = `${galleryinfo.japanese_title}_${id}.zip`
      var filelist
      if (!id.match(/#/)) {
        filelist = galleryinfo.files
      } else {
        var ulimit = id.match(/[0-9]+#([0-9]*)/)[1]
        var tlimit = id.match(/[0-9]+#[0-9]+:([0-9]+)/)[1]
        filelist = galleryinfo.files.slice(Number(ulimit), Number(tlimit))
      }
      for (var file in filelist) {
        urls.push({
          url: url_from_url_from_hash(id.match(/[0-9]+/)[0], galleryinfo.files[file]),
          name: galleryinfo.files[file].name
        })
      }
      return urls
    }).then(urls=>createText(id.match(/[0-9]+/)[0], urls, basedir)).then(text=>{
      resolve(text)
    })
  })
}

function spawnAsync(exename, options) {
  return new Promise(resolve => {
    const ariaps = spawn(join("bin", exename), options)
    ariaps.stdout.on('data', (chunk) => console.log(chunk.toString()))
    ariaps.stderr.on('data', (chunk) => console.log(chunk.toString()))
    ariaps.on("close", () => resolve())
  })
}

function exec(id) {
  return new Promise(resolve => createImageList(id, id.match(/[0-9]+/)[0])
    .then(text => {
      if (!existsSync(`${id.match(/[0-9]+/)[0]}`)) {
        mkdirSync(`${id.match(/[0-9]+/)[0]}`);
      }
      writeFileSync(join(`${id.match(/[0-9]+/)[0]}`, "list.txt"), text)
      console.log(`[${id.match(/[0-9]+/)[0]}] Downloading ... `)
    })
    .then(() => spawnAsync("aria2c", ["-c", "-i", join(`${id.match(/[0-9]+/)[0]}`, "list.txt"), "-c", "-m", "3", "-x", "2"]))
    .then(() => {
      unlinkSync(join(`${id.match(/[0-9]+/)[0]}`, "list.txt"))
      console.log(`[${id.match(/[0-9]+/)[0]}] Compressing ... `)
    })
    .then(() => spawnAsync("7z", ["a", filename[id.match(/[0-9]+/)[0]], `${id.match(/[0-9]+/)[0]}`]))
    .then(() => {
      console.log(`[${id.match(/[0-9]+/)[0]}] Deleting cache ... `)
      rmdirSync(`${id.match(/[0-9]+/)[0]}`, { recursive: true })
    })
    .then(()=>resolve())
  )
}

function promise_loop(func, args, onEndOne=()=>{}, count=0) {
  func(args[count]).then(()=>{
    onEndOne(count)
    if (args.length !== count+1) {
      promise_loop(func, args, onEndOne=onEndOne, count+1)
    }
  })
}

if (ids.length === 1) {
  exec(arg_to_id(ids[0]))
} else {
  var args = args_to_ids(ids)
  console.log("ID: ", args)
  promise_loop(exec, args)
}
