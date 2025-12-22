const API_KEY = "VV38F92FKXX9VA20";
const SYMBOLS = ["AMZN", "MSFT", "GOOGL", "META", "NVDA", "PLTR", "ASML"];

type MonthlyPoint = {
  date: string;
  [symbol: string]: number;
};

export async function getMonthlyPortfolioPerformance(): Promise<MonthlyPoint[]> {
  const monthlyData: Record<string, MonthlyPoint> = {};

  // Fetch each symbol
  for (const symbol of SYMBOLS) {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${symbol}&apikey=${API_KEY}`
    );
    const json = await res.json();
    const series = json["Monthly Adjusted Time Series"];
    if (!series) continue;

    // Filter for 2024+
    const dates = Object.keys(series)
      .filter((d) => d >= "2024-01-01")
      .sort();

    const startPrice = parseFloat(series[dates[0]]["5. adjusted close"]);

    for (const date of dates) {
      const price = parseFloat(series[date]["5. adjusted close"]);
      const gain = ((price - startPrice) / startPrice) * 100;

      if (!monthlyData[date]) monthlyData[date] = { date };
      monthlyData[date][symbol] = Number(gain.toFixed(2));
    }
  }

  // Normalize: make sure each row has all symbols
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
      newRow["PORTFOLIO_AVG"] = +(sum / SYMBOLS.length).toFixed(2); // add portfolio average
      return newRow;
    });

  return normalizedData;
}