export default async function handler(req, res) {
  try {
    const location = req.query.location || "Chennai";

    const query = `"${location}" AND (rain OR rainfall OR flood OR weather OR cyclone)`;

    const params = new URLSearchParams({
      q: query,
      lang: "en",
      country: "in",
      max: "10",
      sortby: "publishedAt",
      apikey: process.env.GNEWS_API_KEY
    });

    const response = await fetch(
      `https://gnews.io/api/v4/search?${params.toString()}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "News API request failed",
        details: errorText
      });
    }

    const data = await response.json();

    const articles = (data.articles || []).map(article => ({
      title: article.title,
      description: article.description,
      url: article.url,
      publishedAt: article.publishedAt,
      source: article.source?.name || "Unknown source",
      sourceUrl: article.source?.url || ""
    }));

    return res.status(200).json({
      location,
      count: articles.length,
      articles
    });

  } catch (error) {
    return res.status(500).json({
      error: "Unable to fetch news",
      details: error.message
    });
  }
}
