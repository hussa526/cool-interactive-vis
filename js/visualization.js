// Global state
let data = null;
let selectedIndustries = new Set();
let selectedCountry = 'all';
let selectedStage = 'all';
let selectedYear = 'all';
let selectedSize = 'all';
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

  // Create additional coordinated views
  updateAllViews();
});

function initializeFilters() {
  // Initialize industry filters (buttons)
  const industryContainer = d3.select("#industry-filters");
  data.top_industries.forEach((industry) => {
    const button = industryContainer
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
        updateAllViews();
      });

    selectedIndustries.add(industry);
  });

  // Initialize country filter (dropdown)
  const countries = [...new Set(data.events.map(e => e.country))].sort();
  const countrySelect = d3.select("#country-filter");

  countries.forEach(country => {
    countrySelect.append("option")
      .attr("value", country)
      .text(country);
  });

  countrySelect.on("change", function() {
    selectedCountry = this.value;
    updateVisualization();
    updateStats();
    updateAllViews();
  });

  // Initialize company stage filter (dropdown)
  const stages = [...new Set(data.events.map(e => e.stage).filter(s => s && s !== ""))];
  const sortedStages = sortStages(stages);
  const stageSelect = d3.select("#stage-filter");

  sortedStages.forEach(stage => {
    stageSelect.append("option")
      .attr("value", stage)
      .text(stage);
  });

  stageSelect.on("change", function() {
    selectedStage = this.value;
    updateVisualization();
    updateStats();
    updateAllViews();
  });

  // Initialize year filter
  const years = [...new Set(data.events.map(e => e.year))].sort();
  const yearSelect = d3.select("#year-filter");

  years.forEach(year => {
    yearSelect.append("option")
      .attr("value", year)
      .text(year);
  });

  yearSelect.on("change", function() {
    selectedYear = this.value;
    updateVisualization();
    updateStats();
    updateAllViews();
  });

  // Initialize size filter
  d3.select("#size-filter").on("change", function() {
    selectedSize = this.value;
    updateVisualization();
    updateStats();
    updateAllViews();
  });
}

function sortStages(stages) {
  const stageOrder = ["Seed", "Series A", "Series B", "Series C", "Series D", "Series E", "Series F", "Series G", "Series H", "Series I", "Series J", "Post-IPO", "Acquired", "Private Equity", "Unknown"];
  return stages.sort((a, b) => {
    const indexA = stageOrder.indexOf(a);
    const indexB = stageOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

function setupSearch() {
  const searchInput = d3.select("#company-search");
  const dropdown = d3.select("#autocomplete-dropdown");
  
  // Get all unique company names
  const allCompanies = [...new Set(data.events.map(e => e.company))].sort();
  let selectedIndex = -1;

  searchInput.on("input", function () {
    const query = this.value.trim();
    const queryLower = query.toLowerCase();

    if (query.length > 0) {
      // Find top 5 matching companies
      const matchingCompanies = allCompanies
        .filter(company => company.toLowerCase().includes(queryLower))
        .slice(0, 5);

      if (matchingCompanies.length > 0) {
        // Show dropdown with matches
        dropdown.classed("visible", true);
        dropdown.html("");
        
        matchingCompanies.forEach((company, index) => {
          const item = dropdown.append("div")
            .attr("class", "autocomplete-item")
            .attr("data-index", index)
            .text(company)
            .on("click", function() {
              selectCompany(company);
            })
            .on("mouseenter", function() {
              dropdown.selectAll(".autocomplete-item").classed("selected", false);
              d3.select(this).classed("selected", true);
              selectedIndex = index;
            });
        });
        
        selectedIndex = -1;
      } else {
        // Show no results message
        dropdown.classed("visible", true);
        dropdown.html("");
        dropdown.append("div")
          .attr("class", "autocomplete-no-results")
          .text("No companies found");
      }

      // Filter events for highlighting
      const matchingEvents = data.events.filter((e) =>
        e.company.toLowerCase().includes(queryLower)
      );

      if (matchingEvents.length > 0) {
        highlightCompany(matchingEvents);
      } else {
        d3.selectAll(".highlight-circle").remove();
      }
    } else {
      // Clear highlights and dropdown
      dropdown.classed("visible", false);
      dropdown.html("");
      d3.selectAll(".highlight-circle").remove();
      selectedIndex = -1;
    }
  });

  // Handle keyboard navigation
  searchInput.on("keydown", function(event) {
    const items = dropdown.selectAll(".autocomplete-item");
    const itemCount = items.size();
    
    if (!dropdown.classed("visible") || itemCount === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % itemCount;
      updateSelection();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = selectedIndex <= 0 ? itemCount - 1 : selectedIndex - 1;
      updateSelection();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < itemCount) {
        const selectedCompany = items.nodes()[selectedIndex].textContent;
        selectCompany(selectedCompany);
      }
    } else if (event.key === "Escape") {
      dropdown.classed("visible", false);
      dropdown.html("");
      selectedIndex = -1;
    }
  });

  function updateSelection() {
    dropdown.selectAll(".autocomplete-item").classed("selected", false);
    if (selectedIndex >= 0) {
      dropdown.selectAll(".autocomplete-item")
        .filter((d, i) => i === selectedIndex)
        .classed("selected", true);
    }
  }

  function selectCompany(company) {
    searchInput.property("value", company);
    dropdown.classed("visible", false);
    dropdown.html("");
    selectedIndex = -1;
    
    // Highlight the selected company
    const companyEvents = data.events.filter(e => e.company === company);
    if (companyEvents.length > 0) {
      highlightCompany(companyEvents);
    }
  }

  // Close dropdown when clicking outside
  d3.select("body").on("click", function(event) {
    if (!searchInput.node().contains(event.target) && 
        !dropdown.node().contains(event.target)) {
      dropdown.classed("visible", false);
      dropdown.html("");
      selectedIndex = -1;
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
  const tooltip = d3.select('#tooltip');

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
        .style("opacity", 0.8)
        .style("cursor", "pointer")
        .on("mouseover", function(mouseEvent) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 8)
            .style("opacity", 1);

          // Format the date nicely
          const formattedDate = new Date(event.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });

          // Build tooltip content
          let tooltipContent = `
            <strong>${event.company}</strong>
            <div class="tooltip-row">Date: ${formattedDate}</div>
            <div class="tooltip-row">Layoffs: ${event.total_laid_off.toLocaleString()}</div>
            <div class="tooltip-row">Industry: ${event.industry}</div>
            <div class="tooltip-row">Location: ${event.location}, ${event.country}</div>
          `;

          // Add optional fields if they exist
          if (event.percentage && event.percentage !== "") {
            tooltipContent += `<div class="tooltip-row">Percentage: ${event.percentage}%</div>`;
          }
          if (event.stage && event.stage !== "") {
            tooltipContent += `<div class="tooltip-row">Stage: ${event.stage}</div>`;
          }
          if (event.funds_raised && event.funds_raised !== "") {
            tooltipContent += `<div class="tooltip-row">Funds Raised: $${event.funds_raised}M</div>`;
          }

          tooltip.classed('visible', true)
            .html(tooltipContent)
            .style('left', (mouseEvent.pageX + 15) + 'px')
            .style('top', (mouseEvent.pageY - 28) + 'px');
        })
        .on("mouseout", function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 6)
            .style("opacity", 0.8);

          tooltip.classed('visible', false);
        });
    }
  });
}

function updateVisualization() {
  // Clear existing chart
  d3.select("#chart").html("");

  // Filter events based on all active filters
  const filteredEvents = getFilteredEvents();

  // Recalculate monthly aggregations from filtered events
  const monthlyAggregated = {};
  filteredEvents.forEach(event => {
    const month = event.month;
    const industry = event.industry;

    if (!monthlyAggregated[month]) {
      monthlyAggregated[month] = {};
    }

    if (!monthlyAggregated[month][industry]) {
      monthlyAggregated[month][industry] = 0;
    }

    monthlyAggregated[month][industry] += event.total_laid_off;
  });

  // Convert to array format for D3
  const filteredData = Object.keys(monthlyAggregated).sort().map(month => {
    const entry = { month: month };
    data.top_industries.forEach(industry => {
      if (selectedIndustries.has(industry)) {
        entry[industry] = monthlyAggregated[month][industry] || 0;
      }
    });
    return entry;
  });

  // Create stacked area chart
  createStackedAreaChart(filteredData);
}

function getFilteredEvents() {
  return data.events.filter(event => {
    // Filter by industry
    if (!selectedIndustries.has(event.industry)) {
      return false;
    }

    // Filter by country
    if (selectedCountry !== 'all' && event.country !== selectedCountry) {
      return false;
    }

    // Filter by stage
    if (selectedStage !== 'all' && event.stage !== selectedStage) {
      return false;
    }

    // Filter by year
    if (selectedYear !== 'all' && event.year !== parseInt(selectedYear)) {
      return false;
    }

    // Filter by size
    if (selectedSize !== 'all') {
      const layoffs = event.total_laid_off;
      if (selectedSize === '0-100' && layoffs >= 100) return false;
      if (selectedSize === '100-500' && (layoffs < 100 || layoffs >= 500)) return false;
      if (selectedSize === '500-1000' && (layoffs < 500 || layoffs >= 1000)) return false;
      if (selectedSize === '1000+' && layoffs < 1000) return false;
    }

    return true;
  });
}

function createStackedAreaChart(monthlyData) {
    // Dimensions
    const margin = { top: 40, right: 150, bottom: 60, left: 80 };
    const width = Math.max(1000, window.innerWidth * 0.8) - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select('#chart')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
        .attr('class', 'chart-group')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates
    const parseDate = d3.timeParse('%Y-%m');
    monthlyData.forEach(d => {
        d.date = parseDate(d.month);
    });

    // Stack data
    const industries = Array.from(selectedIndustries);
    const stack = d3.stack()
        .keys(industries)
        .order(d3.stackOrderNone)
        .offset(d3.stackOffsetNone);

    const series = stack(monthlyData);

    // Scales
    const xScale = d3.scaleTime()
        .domain(d3.extent(monthlyData, d => d.date))
        .range([0, width]);

    const yMax = d3.max(series, d => d3.max(d, d => d[1]));
    const yScale = d3.scaleLinear()
        .domain([0, yMax])
        .range([height, 0])
        .nice();

    // Store scales for highlighting
    chart = { xScale, yScale };

    // Add grid
    g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(yScale)
            .tickSize(-width)
            .tickFormat('')
        );

    // Area generator
    const area = d3.area()
        .x(d => xScale(d.data.date))
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    // Tooltip
    const tooltip = d3.select('#tooltip');

    // Draw areas
    const layers = g.selectAll('.layer')
        .data(series)
        .join('g')
        .attr('class', 'layer');

    layers.append('path')
        .attr('class', 'area')
        .attr('fill', d => colorScale(d.key))
        .attr('opacity', 0)
        .attr('d', area)
        .transition()
        .duration(1000)
        .attr('opacity', 0.8)
        .on('end', function() {
            d3.select(this)
                .on('mouseover', areaMouseover)
                .on('mouseout', areaMouseout);
        });

    function areaMouseover(event, d) {
        d3.select(this)
            .transition()
            .duration(200)
            .attr('opacity', 1);

        // Find closest data point
        const [mouseX] = d3.pointer(event);
        const x0 = xScale.invert(mouseX);

        // Find closest month
        const bisect = d3.bisector(d => d.date).left;
        const index = bisect(monthlyData, x0, 1);
        const d0 = monthlyData[index - 1];
        const d1 = monthlyData[index];
        const closestData = x0 - d0.date > d1.date - x0 ? d1 : d0;

        // Show tooltip
        const value = closestData[d.key] || 0;
        tooltip.classed('visible', true)
            .html(`
                <strong>${d.key}</strong>
                <div class="tooltip-row">Month: ${closestData.month}</div>
                <div class="tooltip-row">Layoffs: ${value.toLocaleString()}</div>
            `)
            .style('left', (event.pageX + 15) + 'px')
            .style('top', (event.pageY - 28) + 'px');
    }

    function areaMouseout() {
        d3.select(this)
            .transition()
            .duration(200)
            .attr('opacity', 0.8);

        tooltip.classed('visible', false);
    }

    // X axis
    g.append('g')
        .attr('class', 'axis x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale)
            .ticks(d3.timeMonth.every(6))
            .tickFormat(d3.timeFormat('%b %Y'))
        )
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end');

    // Y axis
    g.append('g')
        .attr('class', 'axis y-axis')
        .call(d3.axisLeft(yScale)
            .ticks(8)
            .tickFormat(d => d.toLocaleString())
        );

    // X axis label
    g.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + 55)
        .attr('text-anchor', 'middle')
        .text('Time Period');

    // Y axis label
    g.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -60)
        .attr('text-anchor', 'middle')
        .text('Number of Layoffs');

    // Legend
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${width + margin.left + 20}, ${margin.top})`);

    industries.forEach((industry, i) => {
        const legendRow = legend.append('g')
            .attr('class', 'legend-item')
            .attr('transform', `translate(0, ${i * 25})`)
            .style('cursor', 'pointer')
            .on('click', function() {
                // Toggle industry selection
                const button = d3.select(`#industry-filters button`)
                    .filter(function() { return this.textContent === industry; });

                const isActive = button.classed('active');
                button.classed('active', !isActive);

                if (isActive) {
                    selectedIndustries.delete(industry);
                } else {
                    selectedIndustries.add(industry);
                }

                updateVisualization();
                updateStats();
            });

        legendRow.append('rect')
            .attr('width', 18)
            .attr('height', 18)
            .attr('fill', colorScale(industry))
            .attr('rx', 3);

        legendRow.append('text')
            .attr('class', 'legend-text')
            .attr('x', 25)
            .attr('y', 14)
            .text(industry);
    });

    // Add annotations for key events
    addAnnotations(g, xScale, yScale, height);
}

function addAnnotations(g, xScale, yScale, height) {
    const annotations = [
        { date: '2020-03', label: 'COVID-19 Begins', color: '#e74c3c' },
        { date: '2022-11', label: 'Tech Winter', color: '#3498db' },
        { date: '2023-11', label: 'ChatGPT Era', color: '#2ecc71' }
    ];

    const parseDate = d3.timeParse('%Y-%m');

    annotations.forEach(ann => {
        const date = parseDate(ann.date);
        const x = xScale(date);

        if (x >= 0 && x <= xScale.range()[1]) {
            // Vertical line
            g.append('line')
                .attr('class', 'annotation-line')
                .attr('x1', x)
                .attr('x2', x)
                .attr('y1', height)
                .attr('y2', height)
                .attr('stroke', ann.color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
                .attr('opacity', 0)
                .transition()
                .delay(1000)
                .duration(500)
                .attr('y1', 0)
                .attr('opacity', 0.5);

            // Label
            g.append('text')
                .attr('class', 'annotation-text')
                .attr('x', x)
                .attr('y', -10)
                .attr('text-anchor', 'middle')
                .attr('fill', ann.color)
                .attr('font-size', '11px')
                .attr('font-weight', '600')
                .attr('opacity', 0)
                .text(ann.label)
                .transition()
                .delay(1200)
                .duration(500)
                .attr('opacity', 1);
        }
    });
}

function updateStats() {
    // Calculate stats based on all active filters
    const filteredEvents = getFilteredEvents();

    let totalLayoffs = 0;
    const companiesSet = new Set();

    filteredEvents.forEach(event => {
        totalLayoffs += event.total_laid_off;
        companiesSet.add(event.company);
    });

    // Update stat boxes with animation
    animateNumber('#total-layoffs', totalLayoffs);
    animateNumber('#companies-affected', companiesSet.size);

    // Update time period based on filtered data
    if (filteredEvents.length > 0) {
        const dates = filteredEvents.map(e => e.date).sort();
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];
        d3.select('#selected-period')
            .text(`${startDate.substring(0, 7)} to ${endDate.substring(0, 7)}`);
    } else {
        d3.select('#selected-period')
            .text('No data');
    }
}

// Animate number counting
function animateNumber(selector, targetValue) {
    const element = d3.select(selector);
    const currentValue = parseInt(element.text().replace(/,/g, '')) || 0;

    element
        .transition()
        .duration(1000)
        .tween('text', function() {
            const interpolator = d3.interpolateNumber(currentValue, targetValue);
            return function(t) {
                this.textContent = Math.round(interpolator(t)).toLocaleString();
            };
        });
}

// Master update function for all coordinated views
function updateAllViews() {
    createBarChart();
    createDonutChart();
}

// Top Companies Bar Chart
function createBarChart() {
    const container = d3.select('#bar-chart');
    container.html('');

    const filteredEvents = getFilteredEvents();

    // Aggregate by company
    const companyData = {};
    filteredEvents.forEach(event => {
        if (!companyData[event.company]) {
            companyData[event.company] = 0;
        }
        companyData[event.company] += event.total_laid_off;
    });

    // Convert to array and sort
    const topCompanies = Object.entries(companyData)
        .map(([company, total]) => ({ company, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 15);

    if (topCompanies.length === 0) {
        container.append('p')
            .style('text-align', 'center')
            .style('color', '#7f8c8d')
            .text('No data available');
        return;
    }

    // Dimensions
    const margin = { top: 10, right: 20, bottom: 40, left: 140 };
    const containerWidth = document.getElementById('bar-chart').parentElement.clientWidth;
    const width = Math.max(400, containerWidth - 80) - margin.left - margin.right;
    const height = Math.max(400, topCompanies.length * 30) - margin.top - margin.bottom;

    // Create SVG
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(topCompanies, d => d.total)])
        .range([0, width])
        .nice();

    const yScale = d3.scaleBand()
        .domain(topCompanies.map(d => d.company))
        .range([0, height])
        .padding(0.2);

    // Tooltip
    const tooltip = d3.select('#tooltip');

    // Draw bars
    g.selectAll('.bar-chart-bar')
        .data(topCompanies)
        .join('rect')
        .attr('class', 'bar-chart-bar')
        .attr('x', 0)
        .attr('y', d => yScale(d.company))
        .attr('width', 0)
        .attr('height', yScale.bandwidth())
        .attr('fill', '#667eea')
        .style('cursor', 'pointer')
        .on('click', function(event, d) {
            // Highlight this company on main chart
            const companyEvents = data.events.filter(e => e.company === d.company);
            highlightCompany(companyEvents);

            // Update search box to show the company name
            d3.select('#company-search').property('value', d.company);
        })
        .on('mouseover', function(event, d) {
            d3.select(this).attr('fill', '#764ba2');

            tooltip.classed('visible', true)
                .html(`
                    <strong>${d.company}</strong>
                    <div class="tooltip-row">Total Layoffs: ${d.total.toLocaleString()}</div>
                `)
                .style('left', (event.pageX + 15) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).attr('fill', '#667eea');
            tooltip.classed('visible', false);
        })
        .transition()
        .duration(800)
        .attr('width', d => xScale(d.total));

    // Y axis (company names)
    g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(yScale))
        .selectAll('text')
        .style('font-size', '11px')
        .style('cursor', 'pointer')
        .on('click', function(event, d) {
            const companyEvents = data.events.filter(e => e.company === d);
            highlightCompany(companyEvents);
            d3.select('#company-search').property('value', d);
        });

    // X axis
    g.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => d.toLocaleString()));
}

// Industry Donut Chart
function createDonutChart() {
    const container = d3.select('#donut-chart');
    container.html('');

    const filteredEvents = getFilteredEvents();

    // Aggregate by industry
    const industryData = {};
    filteredEvents.forEach(event => {
        if (!industryData[event.industry]) {
            industryData[event.industry] = 0;
        }
        industryData[event.industry] += event.total_laid_off;
    });

    const pieData = Object.entries(industryData)
        .map(([industry, total]) => ({ industry, total }));

    if (pieData.length === 0) {
        container.append('p')
            .style('text-align', 'center')
            .style('color', '#7f8c8d')
            .text('No data available');
        return;
    }

    // Dimensions
    const width = 350;
    const height = 350;
    const radius = Math.min(width, height) / 2 - 40;

    // Create SVG
    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

    // Pie layout
    const pie = d3.pie()
        .value(d => d.total)
        .sort(null);

    // Arc generator
    const arc = d3.arc()
        .innerRadius(radius * 0.6)
        .outerRadius(radius);

    const arcHover = d3.arc()
        .innerRadius(radius * 0.6)
        .outerRadius(radius * 1.05);

    // Tooltip
    const tooltip = d3.select('#tooltip');

    // Draw segments
    const segments = g.selectAll('.donut-segment')
        .data(pie(pieData))
        .join('path')
        .attr('class', 'donut-segment')
        .attr('d', arc)
        .attr('fill', d => colorScale(d.data.industry))
        .attr('opacity', d => selectedIndustries.has(d.data.industry) ? 0.9 : 0.3)
        .style('cursor', 'pointer')
        .on('click', function(event, d) {
            // Toggle industry filter
            const industry = d.data.industry;
            const button = d3.select('#industry-filters button')
                .filter(function() { return this.textContent === industry; });

            const isActive = selectedIndustries.has(industry);

            if (isActive) {
                selectedIndustries.delete(industry);
                button.classed('active', false);
            } else {
                selectedIndustries.add(industry);
                button.classed('active', true);
            }

            updateVisualization();
            updateStats();
            updateAllViews();
        })
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('d', arcHover);

            const percentage = (d.data.total / d3.sum(pieData, p => p.total) * 100).toFixed(1);

            tooltip.classed('visible', true)
                .html(`
                    <strong>${d.data.industry}</strong>
                    <div class="tooltip-row">Layoffs: ${d.data.total.toLocaleString()}</div>
                    <div class="tooltip-row">Percentage: ${percentage}%</div>
                `)
                .style('left', (event.pageX + 15) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('d', arc);

            tooltip.classed('visible', false);
        });

    // Add center label
    g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.5em')
        .style('font-size', '24px')
        .style('font-weight', '700')
        .style('fill', '#667eea')
        .text(d3.sum(pieData, d => d.total).toLocaleString());

    g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .style('font-size', '12px')
        .style('fill', '#7f8c8d')
        .text('Total Layoffs');
}

// Responsive resize
window.addEventListener('resize', () => {
    if (data) {
        updateVisualization();
        updateAllViews();
    }
});
