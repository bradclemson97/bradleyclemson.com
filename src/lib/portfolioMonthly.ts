import fs from "fs";
import path from "path";

const API_KEY = "VV38F92FKXX9VA20";
const SYMBOLS = ["AMZN", "MSFT", "GOOGL", "META", "NVDA", "PLTR", "ASML"];
const CACHE_FILE = path.resolve("./src/data/portfolioMonthly.json");

type MonthlyPoint = {
  date: string;
  [symbol: string]: number;
};

async function fetchSymbol(symbol: string) {
  const res = await fetch(
    `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${symbol}&apikey=${API_KEY}`
  );
  const json = await res.json();
  const series = json["Monthly Adjusted Time Series"];
  if (!series) {
    console.warn(`No data for ${symbol}`);
    return {};
  }

  const dates = Object.keys(series).filter((d) => d >= "2024-01-01").sort();
  if (dates.length === 0) return {};

  const startPrice = parseFloat(series[dates[0]]["5. adjusted close"]);
  const result: Record<string, number> = {};

  for (const date of dates) {
    const price = parseFloat(series[date]["5. adjusted close"]);
    const gain = ((price - startPrice) / startPrice) * 100;
    result[date] = Number(gain.toFixed(2));
  }

  return result;
}

export async function getMonthlyPortfolioPerformance(): Promise<MonthlyPoint[]> {
  // Check cache first
  if (fs.existsSync(CACHE_FILE)) {
    const cached = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(cached);
  }

  // Fetch all symbols
  const monthlyData: Record<string, MonthlyPoint> = {};

  for (const symbol of SYMBOLS) {
    const symbolData = await fetchSymbol(symbol);
    for (const [date, gain] of Object.entries(symbolData)) {
      if (!monthlyData[date]) monthlyData[date] = { date };
      monthlyData[date][symbol] = gain;
    }
  }

  // Normalize all rows
  const normalizedData: MonthlyPoint[] = Object.values(monthlyData)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((row) => {
      const newRow: MonthlyPoint = { date: row.date };
      let sum = 0;
      for (const sym of SYMBOLS) {
        const val = row[sym] ?? 0;
        newRow[sym] = val;
        sum += val;
      }
      newRow["PORTFOLIO_AVG"] = +(sum / SYMBOLS.length).toFixed(2);
      return newRow;
    });

  // Save cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(normalizedData, null, 2), "utf-8");
  console.log("Portfolio data cached to portfolioMonthly.json");

  return normalizedData;
}