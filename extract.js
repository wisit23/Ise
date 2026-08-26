const fs = require('fs');
const path = require('path');

const srcFile = 'frontend/app/support/panel/page.js';
const code = fs.readFileSync(srcFile, 'utf8');

function extract(name, nextName) {
  let startIdx = code.indexOf(`function ${name}(`);
  if (startIdx === -1) startIdx = code.indexOf(`export default function ${name}(`);
  let endIdx = nextName ? code.indexOf(`function ${nextName}(`) : code.length;
  if (endIdx === -1) endIdx = code.indexOf(`export default function ${nextName}(`);
  if (endIdx === -1) endIdx = code.length;
  
  // Find the preceding "// ───" if any
  let beforeStart = code.lastIndexOf('// ───', startIdx);
  if (beforeStart !== -1 && (startIdx - beforeStart) < 200) {
    startIdx = beforeStart;
  }
  
  let beforeEnd = code.lastIndexOf('// ───', endIdx);
  if (beforeEnd !== -1 && (endIdx - beforeEnd) < 200) {
    endIdx = beforeEnd;
  }

  return code.substring(startIdx, endIdx).trim();
}

const uiImports = `import Badge from "../ui/Badge";
import KpiCard from "../ui/KpiCard";
import ChartCard from "../ui/ChartCard";
import DropdownFilter from "../ui/DropdownFilter";
import {
  TICKET_STATUS_LABEL, TICKET_STATUS_STYLE, PRIORITY_LABEL, PRIORITY_STYLE,
  AGENT_NEXT_STATUS, DISPUTE_STATUS_LABEL, DISPUTE_STATUS_STYLE, ORDER_STATUS_LABEL,
  HELP_CATEGORIES, DONUT_PRIORITY_COLORS, DONUT_DISPUTE_COLORS, PAGE_SIZE
} from "../../../lib/supportConstants";
import { apiFetch, fetchAuthedBlobUrl } from "../../../lib/api";
`;

function writeComponent(filename, functionName, nextName, extraImports = "") {
  const content = extract(functionName, nextName);
  const fullContent = `"use client";\nimport { useState, useEffect, useRef } from "react";\nimport Link from "next/link";\n${extraImports}\n${uiImports}\n\nexport default ${content}\n`;
  fs.writeFileSync(filename, fullContent);
  console.log(`Wrote ${filename}`);
}

writeComponent('frontend/components/support/sections/DashboardSection.js', 'DashboardSection', 'TicketsSection', 'import DonutChart from "../../charts/DonutChart";\nimport TrendBarChart from "../../charts/TrendBarChart";\n');
writeComponent('frontend/components/support/sections/TicketsSection.js', 'TicketsSection', 'DisputesSection', 'import Pagination from "../../Pagination";\n');
writeComponent('frontend/components/support/sections/DisputesSection.js', 'DisputesSection', 'OrdersSection', 'import Pagination from "../../Pagination";\n');
writeComponent('frontend/components/support/sections/OrdersSection.js', 'OrdersSection', 'FaqSection', 'import Pagination from "../../Pagination";\n');
writeComponent('frontend/components/support/sections/FaqSection.js', 'FaqSection', 'SupportPanelPage', 'import Pagination from "../../Pagination";\n');

// Now write the main page
const mainContent = extract('SupportPanelPage', null);
const mainFull = `"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../../components/NavBar";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

import DashboardSection from "../../../components/support/sections/DashboardSection";
import TicketsSection from "../../../components/support/sections/TicketsSection";
import DisputesSection from "../../../components/support/sections/DisputesSection";
import OrdersSection from "../../../components/support/sections/OrdersSection";
import FaqSection from "../../../components/support/sections/FaqSection";

${mainContent}
`;
fs.writeFileSync('frontend/app/support/panel/page.js', mainFull);
console.log('Wrote frontend/app/support/panel/page.js');
