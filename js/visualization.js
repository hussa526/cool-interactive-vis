// Global state
let data = null;
let selectedIndustries = new Set();
let chart = null;

// Color scale for industries
const colorScale = d3
  .scaleOrdinal()
  .domain([
    "Hardware",
    "Other",
    "Consumer",
    "Retail",
    "Transportation",
    "Finance",
    "Food",
    "Healthcare",
  ])
  .range([
    "#667eea",
    "#764ba2",
    "#f093fb",
    "#4facfe",
    "#43e97b",
    "#fa709a",
    "#fee140",
    "#30cfd0",
  ]);

// Load and initialize
d3.json("data/layoffs_processed.json").then((loadedData) => {
  data = loadedData;
  console.log("Data loaded:", data);

  // Initialize filters
  initializeFilters();

  // Create initial visualization
  updateVisualization();

  // Update stats
  updateStats();

  // Setup search
  setupSearch();
});

function initializeFilters() {
  const filterContainer = d3.select("#industry-filters");

  data.top_industries.forEach((industry) => {
    const button = filterContainer
      .append("button")
      .attr("class", "filter-btn active")
      .text(industry)
      .on("click", function () {
        const btn = d3.select(this);
        const isActive = btn.classed("active");

        if (isActive) {
          btn.classed("active", false);
          selectedIndustries.delete(industry);
        } else {
          btn.classed("active", true);
          selectedIndustries.add(industry);
        }

        updateVisualization();
        updateStats();
      });

    // Initially all selected
    selectedIndustries.add(industry);
  });
}

function setupSearch() {
  const searchInput = d3.select("#company-search");

  searchInput.on("input", function () {
    const query = this.value.toLowerCase().trim();

    if (query.length > 0) {
      // Filter events
      const matchingEvents = data.events.filter((e) =>
        e.company.toLowerCase().includes(query)
      );

      if (matchingEvents.length > 0) {
        highlightCompany(matchingEvents);
      }
    } else {
      // Clear highlights
      d3.selectAll(".highlight-circle").remove();
    }
  });
}

function highlightCompany(events) {
  if (!chart) return;

  // Remove old highlights
  d3.selectAll(".highlight-circle").remove();

  // Add highlights for matching events
  const svg = d3.select("#chart svg");
  const g = svg.select(".chart-group");

  events.forEach((event) => {
    const x = chart.xScale(d3.timeParse("%Y-%m-%d")(event.date));
    const y = chart.yScale(event.total_laid_off);

    if (x && y) {
      g.append("circle")
        .attr("class", "highlight-circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 6)
        .attr("fill", "red")
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .style("opacity", 0.8);
    }
  });
}

function updateVisualization() {
  // Clear existing chart
  d3.select("#chart").html("");

  // Filter data based on selected industries
  const filteredData = data.monthly.map((d) => {
    const newEntry = { month: d.month };
    data.top_industries.forEach((industry) => {
      if (selectedIndustries.has(industry)) {
        newEntry[industry] = d[industry] || 0;
      }
    });
    return newEntry;
  });

  // Create stacked area chart
  createStackedAreaChart(filteredData);
}
