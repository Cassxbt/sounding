import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BookCapture } from "../types";
import type { StockInfo } from "../eligibility";
import type { Calendar, MarketStates } from "../session";

const FX = join(process.cwd(), "fixtures");
export const load = <T>(name: string): T => JSON.parse(readFileSync(join(FX, name), "utf8"));
export const rhims = () => load<BookCapture>("rhims-20260920T090235Z.json");
export const rspy = () => load<BookCapture>("rspy-20260920T0902Z.json");
export const rspmo = () => load<BookCapture>("rspmo-20260920T0902Z.json");
export const stockInfo = () => load<{ data: StockInfo[] }>("stock-info-20260920.json").data;
export const states = () => load<{ states: MarketStates }>("market-states-20260920.json").states;
export const calendar = () => load<Calendar>("calendar-20260920.json");
/** capture instant of the rHIMS fixture: 2026-09-20T09:02:35.800Z (Sunday) */
export const T_RHIMS = new Date(1789894955800);
