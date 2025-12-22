import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const API_KEY = "VV38F92FKXX9VA20";
const SYMBOLS = ["AMZN", "MSFT", "GOOGL", "META", "NVDA", "PLTR", "ASML"];
const OUTPUT_FILE = path.resolve("./src/data/portfolioMonthly.json");

type MonthlyPoint = {
  date: string;
  [symbol: string]: number;
};

async function fetchSymbol(symbol: string, retries = 3): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${symbol}&apikey=${API_KEY}`
    );
    const json = await res.json();
    const series = json["Monthly Adjusted Time Series"];
    if (!series) {
      throw new Error(`No data returned for ${symbol}`);
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
  } catch (err) {
    console.warn(`Failed to fetch ${symbol}: ${err}`);
    if (retries > 0) {
      console.log(`Retrying ${symbol} in 15 seconds...`);
      await new Promise((res) => setTimeout(res, 15000));
      return fetchSymbol(symbol, retries - 1);
    }
    return {};
  }
}

async function generatePortfolioData() {
  const monthlyData: Record<string, MonthlyPoint> = {};

  for (const symbol of SYMBOLS) {
    console.log(`Fetching ${symbol}...`);
    const symbolData = await fetchSymbol(symbol);
    for (const [date, gain] of Object.entries(symbolData)) {
      if (!monthlyData[date]) monthlyData[date] = { date };
      monthlyData[date][symbol] = gain;
    }
    // Wait 15 seconds between requests to stay under free-tier limit
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }

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

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(normalizedData, null, 2), "utf-8");
  console.log(`Portfolio data saved to ${OUTPUT_FILE}`);
}

generatePortfolioData().catch(console.error);
