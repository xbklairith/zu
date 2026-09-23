// The page's layout engine. elk.bundled runs on the main thread until Task 8
// moves ELK into a Web Worker.
import ELK from "elkjs/lib/elk.bundled.js";
import { superseding } from "./layout";

export const pageEngine = () => superseding(() => new ELK());
