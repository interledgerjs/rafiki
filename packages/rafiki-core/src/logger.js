"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston = __importStar(require("winston"));
const log = {
    child: (options) => {
        const logger = winston['default'].exceptions.logger;
        const child = logger.child(options);
        return child;
    }
};
exports.log = log;
//# sourceMappingURL=logger.js.map