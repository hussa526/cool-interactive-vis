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
        .attr('d', area)
        .attr('fill', d => colorScale(d.key))
        .attr('opacity', 0.8)
        .on('mouseover', function(event, d) {
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
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('opacity', 0.8);

            tooltip.classed('visible', false);
        });

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
                .attr('y1', 0)
                .attr('y2', height)
                .attr('stroke', ann.color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
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
                .text(ann.label);
        }
    });
}

function updateStats() {
    // Calculate stats based on selected industries
    let totalLayoffs = 0;
    const companiesSet = new Set();

    data.events.forEach(event => {
        if (selectedIndustries.has(event.industry)) {
            totalLayoffs += event.total_laid_off;
            companiesSet.add(event.company);
        }
    });

    // Update stat boxes
    d3.select('#total-layoffs')
        .text(totalLayoffs.toLocaleString());

    d3.select('#companies-affected')
        .text(companiesSet.size.toLocaleString());

    const startDate = data.stats.date_range.start;
    const endDate = data.stats.date_range.end;
    d3.select('#selected-period')
        .text(`${startDate.substring(0, 7)} to ${endDate.substring(0, 7)}`);
}

// Responsive resize
window.addEventListener('resize', () => {
    if (data) {
        updateVisualization();
    }
});
