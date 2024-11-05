import { readFileSync, writeFileSync } from "fs";
import readline from "readline";

// Load configuration
interface Config {
  apiToken: string;
  domains: string[];
  selectedSubdomains: { [key: string]: string[] };
}

// Parse command-line arguments to get the config path
const CONFIG_PATH = process.argv.includes("--config")
  ? process.argv[process.argv.indexOf("--config") + 1]
  : "./config.json";

const loadConfig = (): Config => {
  try {
    const data = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(data) as Config;
  } catch (error) {
    // Return an empty object if the config file doesn't exist or fails to load
    return { apiToken: "", domains: [], selectedSubdomains: {} };
  }
};

const saveConfig = (config: Config) => {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log("Configuration saved successfully.");
  } catch (error) {
    console.error("Failed to save config file: " + error.message);
  }
};

const config = loadConfig();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer));
  });
};

const ensureConfigValues = async () => {
  // Prompt for API token if not set
  if (!config.apiToken) {
    config.apiToken = await prompt("Enter your Cloudflare API Token: ");
  }

  // Prompt for domains if not set
  if (!config.domains || config.domains.length === 0) {
    const domainList = await getZones();

    console.log("Available domains:");
    domainList.forEach((domain, index) => {
      console.log(`${index + 1}. ${domain}`);
    });

    const selectedIndices = await prompt(
      "Enter the numbers of the domains to manage (comma-separated): "
    );
    const indices = selectedIndices.split(",").map((num) => parseInt(num.trim()) - 1);

    const selectedDomains = indices.map((index) => domainList[index]);

    config.domains = selectedDomains;
    // const domainList = await prompt("Enter the domains to manage (comma-separated): ");
    // config.domains = domainList.split(",").map(domain => domain.trim());
  }

  // Ensure selectedSubdomains object is initialized for each domain
  config.domains.forEach((domain) => {
    if (!Array.isArray(config.selectedSubdomains[domain])) {
      config.selectedSubdomains[domain] = [];
    }
  });

  saveConfig(config);
};

const ZONE_URL = "https://api.cloudflare.com/client/v4/zones";
const HEADERS = {
  Authorization: `Bearer ${config.apiToken}`,
  "Content-Type": "application/json",
};

// Function to get the public IP address
async function getPublicIp(): Promise<string> {
  const response = await fetch("https://ifconfig.co/ip");
  if (!response.ok) throw new Error("Failed to retrieve public IP.");
  return (await response.text()).trim();
}

// Function to retrieve all Zones by domain name
async function getZones(): Promise<string[]> {
  const response = await fetch(ZONE_URL, { headers: HEADERS });
  if (!response.ok) throw new Error("Failed to retrieve zones.");

  const data = await response.json();
  return data.result.map((zone) => zone.name);
}

// Function to retrieve the Zone ID for a given domain
async function getZoneId(domain: string): Promise<string> {
  const response = await fetch(`${ZONE_URL}?name=${domain}`, {
    headers: HEADERS,
  });
  if (!response.ok)
    throw new Error(`Failed to retrieve zone ID for domain: ${domain}`);

  const data = await response.json();
  const zone = data.result[0];
  if (!zone) throw new Error(`Zone not found for domain: ${domain}`);

  return zone.id;
}

// Function to list DNS records for subdomains and prompt the user for which to update
async function selectSubdomainsToUpdate(zoneId: string, domain: string) {
  const dnsRecordsUrl = `${ZONE_URL}/${zoneId}/dns_records?type=A`;
  const response = await fetch(dnsRecordsUrl, { headers: HEADERS });
  if (!response.ok)
    throw new Error(`Failed to fetch DNS records for domain: ${domain}`);

  const data = await response.json();
  const records = data.result;

  const subdomains = records.map((record) => record.name);

  console.log(`Available subdomains for ${domain}:`);
  subdomains.forEach((subdomain, index) => {
    console.log(`${index + 1}. ${subdomain}`);
  });

  const selectedIndices = await prompt(
    "Enter the numbers of the subdomains to update (comma-separated): "
  );
  const indices = selectedIndices
    .split(",")
    .map((num) => parseInt(num.trim()) - 1);

  const selectedSubdomains = indices.map((index) => subdomains[index]);

  // Add only new subdomains to avoid duplicates
  for (const subdomain of selectedSubdomains) {
    if (!config.selectedSubdomains[domain].includes(subdomain)) {
      config.selectedSubdomains[domain].push(subdomain);
    }
  }

  saveConfig(config);

  console.log("Updated selected subdomains for domain:", domain);
}

// Function to test DNS records by comparing their IP address with the public IP
async function testDnsRecords(
  zoneId: string,
  domain: string,
  currentIp: string
) {
  const dnsRecordsUrl = `${ZONE_URL}/${zoneId}/dns_records?type=A`;
  const response = await fetch(dnsRecordsUrl, { headers: HEADERS });
  if (!response.ok)
    throw new Error(`Failed to fetch DNS records for domain: ${domain}`);

  const data = await response.json();
  const records = data.result;

  for (const record of records) {
    if (
      record.name.endsWith(`.${domain}`) &&
      config.selectedSubdomains[domain]?.includes(record.name)
    ) {
      const status = record.content === currentIp ? "OK!" : "UPDATE!";
      console.log(`- ${record.name} -> ${record.content} (${status})`);
    }
  }
}

// Function to update DNS records for selected subdomains if the IP is different
async function updateDnsRecords(zoneId: string, domain: string, newIp: string) {
  const dnsRecordsUrl = `${ZONE_URL}/${zoneId}/dns_records?type=A`;
  const response = await fetch(dnsRecordsUrl, { headers: HEADERS });
  if (!response.ok)
    throw new Error(`Failed to fetch DNS records for domain: ${domain}`);

  const data = await response.json();
  const records = data.result;

  for (const record of records) {
    if (
      record.name.endsWith(`.${domain}`) &&
      config.selectedSubdomains[domain]?.includes(record.name) &&
      record.content !== newIp
    ) {
      const updateUrl = `${ZONE_URL}/${zoneId}/dns_records/${record.id}`;
      const updateData = {
        type: "A",
        name: record.name,
        content: newIp,
        ttl: record.ttl,
        proxied: record.proxied,
      };

      const updateResponse = await fetch(updateUrl, {
        method: "PUT",
        headers: HEADERS,
        body: JSON.stringify(updateData),
      });

      if (!updateResponse.ok) {
        console.error(`Failed to update ${record.name} in ${domain}`);
        continue;
      }

      console.log(`Updated ${record.name} in ${domain} to IP ${newIp}`);
    }
  }
}

// Main function to process each domain
async function main() {
  await ensureConfigValues();

  const isTestMode = process.argv.includes("--test");
  const isInteractiveMode = process.argv.includes("--select");

  if (isInteractiveMode) {
    for (const domain of config.domains) {
      const zoneId = await getZoneId(domain);
      await selectSubdomainsToUpdate(zoneId, domain);
    }
    rl.close();
  } else if (isTestMode) {
    const currentIp = await getPublicIp();
    console.log(`Public IP retrieved successfully: ${currentIp}`);
    for (const domain of config.domains) {
      const zoneId = await getZoneId(domain);
      await testDnsRecords(zoneId, domain, currentIp);
    }
    rl.close();
  } else {
    const newIp = await getPublicIp();
    console.log(`Retrieved public IP: ${newIp}`);
    for (const domain of config.domains) {
      const zoneId = await getZoneId(domain);
      await updateDnsRecords(zoneId, domain, newIp);
    }
    rl.close();
  }
}

main();
