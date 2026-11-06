// Blockly 打包入口：由 scripts/vendor.mjs 用 esbuild 打包为 web/vendor/blockly/blockly.js
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { pythonGenerator, Order } from "blockly/python";
import * as zhHans from "blockly/msg/zh-hans";

Blockly.setLocale(zhHans);
export { Blockly, pythonGenerator, Order };
