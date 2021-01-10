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
// const id = process.argv[process.argv.length-1]
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

function arg_to_id(url) {
  return (url.match(/^[0-9]*$/)||(new URL(url)).pathname.match(/([0-9]*)\.html/).slice(1))[0]
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
      filename[id] = `${galleryinfo.japanese_title}_${id}.zip`
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
    ariaps.on("close", () => resolve())
  })
}

function exec(id) {
  return new Promise(resolve => createImageList(id, id)
    .then(text => {
      if (!existsSync(`${id}`)) {
        mkdirSync(`${id}`);
      }
      writeFileSync(join(`${id}`, "list.txt"), text)
      console.log(`[${id}] Downloading ... `)
    })
    .then(() => spawnAsync("aria2c", ["-c", "-i", join(`${id}`, "list.txt"), "-c", "-m", "3", "-x", "2"]))
    .then(() => {
      unlinkSync(join(`${id}`, "list.txt"))
      console.log(`[${id}] Compressing ... `)
    })
    .then(() => spawnAsync("7z", ["a", filename[id], `${id}`]))
    .then(() => {
      console.log(`[${id}] Deleting cache ... `)
      rmdirSync(`${id}`, { recursive: true })
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
