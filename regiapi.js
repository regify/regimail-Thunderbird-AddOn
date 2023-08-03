var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { FileUtils }       = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { XPCOMUtils }      = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyGlobalGetters(this, ["IOUtils", "PathUtils"]);

var regiapi = class extends ExtensionCommon.ExtensionAPI {
  static regifyClientPath;
  getAPI(context) {
    return {
      regiapi: {
        // Execute a file with given parameters
        // Hint: 
        // var Arguments = new Array("-C", "thunderbird", "-b");
        async execute(executable, arrParams) {
          var fileExists = await IOUtils.exists(executable);
          if (!fileExists) {
            Services.wm.getMostRecentWindow("mail:3pane")
              .alert("Executable [" + executable + "] not found!");
            return false;
          }
          var progPath = new FileUtils.File(executable);

          let process = Cc[
            "@mozilla.org/process/util;1"
          ].createInstance(Ci.nsIProcess);
          process.init(progPath);
          process.startHidden = false;
          process.noShell = true;

          var xulRuntime = Cc[
            "@mozilla.org/xre/app-info;1"
          ].getService(Ci.nsIXULRuntime);

          if (xulRuntime.OS.toLowerCase().substring(0, 3) != "win") {
            // Linux and Mac need UTF8 based
            process.runw(true, arrParams, arrParams.length);
          } else {
            // Windows is fine with UTF16/UCS encoding
            process.run(true, arrParams, arrParams.length);
          }
          return true;
        },
        async alert(message) {
          Services.wm.getMostRecentWindow("mail:3pane").alert(message);
        },
        // read a file and return content a string
        async readFileText(filename) {
          var ret = await IOUtils.readUTF8(filename);
          return ret;
        },
        async readFileBinary(filename) {
          var ret = await IOUtils.read(filename);
          return ret;
        },
        async writeFileText(filename, data) {
          var ret = await IOUtils.writeUTF8(filename, data);
          return ret;
        },
        async writeFileBinary(filename, data) {
          // first we need to convert the arrayBuffer to some Uint8Array
          var uint8 = new Uint8Array(data);
          uint8.reduce((binary, uint8) => binary + uint8.toString(2), "");
          // then we can save it
          var ret = await IOUtils.write(filename, uint8);
          return ret;
        },
        async moveFile(sourceFilePath, destinationFilePath) {
          var ret = await IOUtils.move(sourceFilePath, destinationFilePath);
          return ret;
        },
        async deleteFolder(folderPath) {
          var ret = await IOUtils.remove(folderPath, { recursive: true });
          return ret;
        },
        deleteFileOnExit(filePath) {
          // get nsIFile from that file path
          let nsiFile = Cc[
            "@mozilla.org/file/local;1"
          ].createInstance(Ci.nsIFile);
          nsiFile.initWithPath(filePath);
          // mark it for deletion on exit
          var extAppLauncher = Cc[
            "@mozilla.org/uriloader/external-helper-app-service;1"
          ].getService(Ci.nsPIExternalAppLauncher);
          extAppLauncher.deleteTemporaryFileOnExit(nsiFile);
        },
        async readDirectory(path) {
          try {
            let children = await IOUtils.getChildren(path);
            return children;
          } catch (ex) {
            // Fall-through, return what we have.
            console.warn("Failed reading directory [" + path + "]!");
          }
          return false;
        },
        async fileExists(filename) {
          var fileExists = await IOUtils.exists(filename);
          return fileExists;
        },
        async createTempFolder(withRegifyFolder) {
          var slash;
          var dirService = Cc[
            "@mozilla.org/file/directory_service;1"
          ].getService(Ci.nsIProperties);
          var tempDirFile = await dirService.get("TmpD", Ci.nsIFile); // returns an nsIFile object
          if (!tempDirFile) {
            return false;
          }
          if (tempDirFile.path.substr(0, 1) == "/") {
            slash = "/"; // *nix
          } else {
            slash = "\\"; // win
          }
          if (withRegifyFolder == undefined || withRegifyFolder == false) {
            return tempDirFile.path + slash;
          }

          // with unique regify subfolder
          var exists = true;
          var i = 0;
          do {
            i++;
            var dir = tempDirFile.path + slash + "regify-" + i;
            exists = await IOUtils.exists(dir);
          } while(exists);
          return dir + slash;
        },
        // Returns %APPDATA% directory of current user incl. regify extension
        async getRegifyHomeDirectory() {
          var dirService = Cc[
            "@mozilla.org/file/directory_service;1"
          ].getService(Ci.nsIProperties);
          var homeDir;
          var homeDirFile;
          var slash;
          try {
            // Windows
            homeDirFile = await dirService.get("AppData", Ci.nsIFile); // returns an nsIFile object
            slash = "\\";
            homeDir = homeDirFile.path + slash;
            homeDir = homeDir.replace(/\\Local\\/gi, slash + 'Roaming' + slash); // make \Local\ to \Roaming\
            homeDir = homeDir + "regify" + slash; // add regify specific part
          } catch(e) {}
          if (!homeDirFile) {
            try {
              // *nix
              homeDirFile = await dirService.get("Home", Ci.nsIFile); // returns an nsIFile object
              slash = "/";
              homeDir = homeDirFile.path + slash;
              homeDir = homeDir + ".regify" + slash; // add regify specific part
            } catch(e) {}
          }
          if (!homeDirFile) {
            return false;
          }
          return homeDir;
        },
        async getRegifyExecutable() {
          if (this.regifyClientPath) {
            // returning the cached path is faster!
            return this.regifyClientPath;
          }
          var locations = ["C:\\Program Files (x86)\\regify client\\regify_client.exe",
                          "/usr/local/bin/regify_client",
                          "/usr/bin/regify_client",
                          "/Applications/regify client.app/Contents/MacOS/regify_client",
                          "/Applications/regify client.app/Contents/MacOS/regify client"];
          for (let i=0; i<locations.length; i++) {
            var fileExists = false;
            try {
              fileExists = await IOUtils.exists(locations[i]);
            } catch(e) {}
            if (fileExists) { 
              this.regifyClientPath = locations[i]; // remember for cache
              return locations[i]; 
            }
          }

          // a last try for Windows (try windows program files folder)
          try {
            let prog = await dirService.get("ProgF", Ci.nsIFile); // returns an nsIFile object
            var filename = prog.path + "\\regify client\\regify_client.exe";
            let fileExists = await IOUtils.exists(filename);
            if (fileExists) { 
              this.regifyClientPath = filename; // remember for cache
              return filename;
            }
          } catch(e) { }
          return "";
        },
        addAttachment(windowId, filePath) {
          let contentWindow = Services.wm.getOuterWindowWithId(windowId);
          let nsiLocalRgfFile = Cc[
            "@mozilla.org/file/local;1"
          ].createInstance(Ci.nsIFile);
          nsiLocalRgfFile.initWithPath(filePath);
          var attFile = contentWindow.FileToAttachment(nsiLocalRgfFile);
          
          // Change content type
          attFile.contentType = "application/vnd.regify";
          // Finaly attach it
          contentWindow.AddAttachments([attFile]);
          return true;
        }
      }
    }
  }
};

// Documentation:
// ------------------------------------------------------------------------------

// IOUtils:
// https://searchfox.org/mozilla-central/source/dom/chrome-webidl/IOUtils.webidl

// PathUtils:
// https://searchfox.org/mozilla-central/source/dom/chrome-webidl/PathUtils.webidl

// FileUtils:
// https://searchfox.org/mozilla-central/source/toolkit/modules/FileUtils.jsm

// nsIProcess:
// https://searchfox.org/mozilla-central/source/xpcom/threads/nsIProcess.idl