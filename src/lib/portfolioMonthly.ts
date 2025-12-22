const API_KEY = "VV38F92FKXX9VA20";

const SYMBOLS = ["AMZN", "MSFT", "GOOGL", "META", "NVDA", "PLTR", "ASML"];

type MonthlyPoint = {
  date: string;
  [symbol: string]: number | string;
};

export async function getMonthlyPortfolioPerformance(): Promise<MonthlyPoint[]> {
  const monthlyData: Record<string, any> = {};

  for (const symbol of SYMBOLS) {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${symbol}&apikey=${API_KEY}`
    );
    const json = await res.json();
    const series = json["Monthly Adjusted Time Series"];

    if (!series) continue;

    const dates = Object.keys(series)
      .filter((d) => d >= "2024-01-01")
      .sort();

    const startPrice = parseFloat(series[dates[0]]["5. adjusted close"]);

    dates.forEach((date) => {
      const price = parseFloat(series[date]["5. adjusted close"]);
      const gain = ((price - startPrice) / startPrice) * 100;

      if (!monthlyData[date]) monthlyData[date] = { date };
      monthlyData[date][symbol] = Number(gain.toFixed(2));
    });
  }

  return Object.values(monthlyData);
}
