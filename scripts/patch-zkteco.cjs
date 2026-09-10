const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "..", "node_modules", "zkteco-js", "src", "ztcp.js");
if (!fs.existsSync(filePath)) process.exit(0);

const source = fs.readFileSync(filePath, "utf8");
const broken = `            } catch (err) {\n                reject(err)\n                console.log(reply)\n            }\n\n            const header = decodeTCPHeader(reply.subarray(0, 16))`;
const fixed = `            } catch (err) {\n                console.log(reply)\n                return reject(err)\n            }\n\n            if (!reply) return reject(new Error('EMPTY_RESPONSE_FROM_DEVICE'))\n\n            const header = decodeTCPHeader(reply.subarray(0, 16))`;

if (source.includes(broken)) {
  fs.writeFileSync(filePath, source.replace(broken, fixed));
  console.log("Patched zkteco-js empty response handling.");
}