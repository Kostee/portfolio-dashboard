import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "DemoPortfolio2026!";
const DEMO_WORKSPACE = "Demo Portfolio";
const DEMO_NOTE = "Fictional public local demo data.";

function fail(message) {
  throw new Error(message);
}

function runSupabase(args, { capture = false } = {}) {
  /*
   * On Windows, npx.cmd is a command script rather than a directly
   * executable program. Invoke it through cmd.exe explicitly instead of
   * passing the .cmd file directly to spawnSync.
   *
   * Every argument supplied to this helper is defined by this file; no
   * external/user input is interpolated into the command.
   */
  const isWindows = process.platform === "win32";

  const executable = isWindows
    ? process.env.ComSpec ?? "cmd.exe"
    : "npx";

  const commandArgs = isWindows
    ? [
        "/d",
        "/s",
        "/c",
        "npx.cmd",
        "supabase",
        ...args,
      ]
    : ["supabase", ...args];

  const result = spawnSync(
    executable,
    commandArgs,
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: capture
        ? ["ignore", "pipe", "pipe"]
        : "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (capture && result.stderr) {
      process.stderr.write(result.stderr);
    }

    fail(
      `Supabase CLI failed: supabase ${args.join(" ")}`,
    );
  }

  return capture ? result.stdout ?? "" : "";
}

function parseEnvOutput(text) {
  const result = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(
      /^([A-Z][A-Z0-9_]*)=(.*)$/,
    );

    if (!match) {
      continue;
    }

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[match[1]] = value;
  }

  return result;
}

function requireLocalApiUrl(value) {
  if (!value) {
    fail(
      "Supabase CLI did not report a local API URL.",
    );
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    fail("Supabase API URL is invalid.");
  }

  const allowedHosts = new Set([
    "127.0.0.1",
    "localhost",
    "::1",
    "[::1]",
  ]);

  if (!allowedHosts.has(parsed.hostname)) {
    fail(
      "REFUSING TO CONTINUE: the Supabase API URL is not loopback/local. " +
        "This demo command may only reset and populate a local Supabase stack.",
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    fail(
      "REFUSING TO CONTINUE: unsupported local Supabase URL protocol.",
    );
  }

  return parsed.toString().replace(/\/$/, "");
}

function getLocalKeys(env) {
  const browserKey =
    env.ANON_KEY ??
    env.PUBLISHABLE_KEY ??
    env.SUPABASE_ANON_KEY ??
    env.SUPABASE_PUBLISHABLE_KEY;

  const adminKey =
    env.SERVICE_ROLE_KEY ??
    env.SECRET_KEY ??
    env.SUPABASE_SERVICE_ROLE_KEY ??
    env.SUPABASE_SECRET_KEY;

  if (!browserKey) {
    fail(
      "Supabase CLI did not report a browser-safe local API key.",
    );
  }

  if (!adminKey) {
    fail(
      "Supabase CLI did not report a local server/admin API key.",
    );
  }

  return {
    browserKey,
    adminKey,
  };
}

function shiftIsoDate(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function todayInTimeZone(
  timeZone = "Europe/Warsaw",
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) =>
        ["year", "month", "day"].includes(part.type),
      )
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function by(rows, field, value, label) {
  const row = rows.find(
    (candidate) => candidate[field] === value,
  );

  if (!row) {
    fail(`Unable to resolve demo ${label}: ${value}`);
  }

  return row;
}

function unwrap(result, label) {
  if (result.error) {
    fail(`${label}: ${result.error.message}`);
  }

  return result.data;
}

async function rpc(
  client,
  functionName,
  parameters,
) {
  return unwrap(
    await client.rpc(functionName, parameters),
    `RPC ${functionName}`,
  );
}

async function exactCount(
  client,
  relation,
  workspaceId,
) {
  const result =
    await client
      .from(relation)
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("workspace_id", workspaceId);

  if (result.error) {
    fail(
      `Count ${relation}: ${result.error.message}`,
    );
  }

  return result.count ?? 0;
}

async function main() {
  console.log("");
  console.log("=== LOCAL-ONLY FICTIONAL DEMO ===");
  console.log(
    "This command resets the local Supabase database.",
  );
  console.log(
    "It never reads or modifies .env.local and refuses a non-loopback API URL.",
  );
  console.log("");

  console.log("Starting local Supabase...");
  runSupabase(["start"]);

  /*
   * Keep the default public seed empty.
   * This opt-in command owns the local demo lifecycle instead.
   */
  console.log("");
  console.log(
    "Resetting LOCAL database from migrations (without default seed)...",
  );

  runSupabase([
    "db",
    "reset",
    "--local",
    "--no-seed",
  ]);

  /*
   * Read CLI-generated LOCAL credentials only after the destructive command
   * was explicitly constrained by --local. Values are never printed.
   */
  const statusEnv = parseEnvOutput(
    runSupabase(
      ["status", "-o", "env"],
      { capture: true },
    ),
  );

  const apiUrl = requireLocalApiUrl(
    statusEnv.API_URL ??
      statusEnv.SUPABASE_URL,
  );

  const {
    browserKey,
    adminKey,
  } = getLocalKeys(statusEnv);

  console.log(`Local API verified: ${apiUrl}`);

  const authOptions = {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  };

  /*
   * Admin credentials are used only in this local Node.js process to create
   * the fictional Auth user. They are never written to source files or shown.
   */
  const admin = createClient(
    apiUrl,
    adminKey,
    {
      auth: authOptions,
    },
  );

  const userClient = createClient(
    apiUrl,
    browserKey,
    {
      auth: authOptions,
    },
  );

  console.log("Creating fictional local Auth user...");

  const createdUser = unwrap(
    await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        display_name: "Alex Demo",
      },
    }),
    "Create local demo user",
  );

  if (!createdUser.user?.id) {
    fail(
      "Local demo Auth user was not created.",
    );
  }

  unwrap(
    await userClient.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    }),
    "Sign in local demo user",
  );

  const today = todayInTimeZone();
  const openingDate = shiftIsoDate(today, -180);

  console.log("Creating fictional workspace...");

  const workspaceId = await rpc(
    userClient,
    "create_workspace",
    {
      p_name: DEMO_WORKSPACE,
      p_base_currency: "PLN",
      p_timezone: "Europe/Warsaw",
      p_detailed_tracking_start_date:
        openingDate,
    },
  );

  if (!workspaceId) {
    fail("Demo workspace was not created.");
  }

  console.log(
    "Creating fictional reference data...",
  );

  const owners = unwrap(
    await userClient
      .from("owners")
      .insert([
        {
          workspace_id: workspaceId,
          display_name: "Alex Demo",
          sort_order: 10,
        },
        {
          workspace_id: workspaceId,
          display_name: "Morgan Demo",
          sort_order: 20,
        },
      ])
      .select("id, display_name"),
    "Insert demo owners",
  );

  const alex = by(
    owners,
    "display_name",
    "Alex Demo",
    "owner",
  );

  const morgan = by(
    owners,
    "display_name",
    "Morgan Demo",
    "owner",
  );

  const providers = unwrap(
    await userClient
      .from("providers")
      .insert([
        {
          workspace_id: workspaceId,
          name: "DemoBroker",
          provider_type: "brokerage",
        },
        {
          workspace_id: workspaceId,
          name: "Example Fund",
          provider_type: "fund_manager",
        },
      ])
      .select("id, name"),
    "Insert demo providers",
  );

  const demoBroker = by(
    providers,
    "name",
    "DemoBroker",
    "provider",
  );

  const exampleFund = by(
    providers,
    "name",
    "Example Fund",
    "provider",
  );

  const assetClasses = unwrap(
    await userClient
      .from("asset_classes")
      .insert([
        {
          workspace_id: workspaceId,
          name: "Equities",
          code: "equities",
          color_hex: "#2563EB",
          sort_order: 10,
        },
        {
          workspace_id: workspaceId,
          name: "ETFs",
          code: "etfs",
          color_hex: "#0EA5E9",
          sort_order: 20,
        },
        {
          workspace_id: workspaceId,
          name: "Real estate",
          code: "real_estate",
          color_hex: "#10B981",
          sort_order: 30,
        },
        {
          workspace_id: workspaceId,
          name: "Retirement fund",
          code: "retirement_fund",
          color_hex: "#8B5CF6",
          sort_order: 40,
        },
      ])
      .select("id, code"),
    "Insert demo asset classes",
  );

  const equities = by(
    assetClasses,
    "code",
    "equities",
    "asset class",
  );

  const etfs = by(
    assetClasses,
    "code",
    "etfs",
    "asset class",
  );

  const realEstate = by(
    assetClasses,
    "code",
    "real_estate",
    "asset class",
  );

  const retirementFund = by(
    assetClasses,
    "code",
    "retirement_fund",
    "asset class",
  );

  const accounts = unwrap(
    await userClient
      .from("accounts")
      .insert([
        {
          workspace_id: workspaceId,
          owner_id: alex.id,
          provider_id: demoBroker.id,
          name: "Brokerage",
          account_type: "brokerage_pln",
          base_currency: "PLN",
        },
        {
          workspace_id: workspaceId,
          owner_id: alex.id,
          provider_id: demoBroker.id,
          name: "Retirement",
          account_type: "ike",
          base_currency: "PLN",
        },
        {
          workspace_id: workspaceId,
          owner_id: morgan.id,
          provider_id: demoBroker.id,
          name: "Brokerage",
          account_type: "brokerage_pln",
          base_currency: "PLN",
        },
        {
          workspace_id: workspaceId,
          owner_id: morgan.id,
          provider_id: exampleFund.id,
          name: "Pension",
          account_type: "ppk",
          base_currency: "PLN",
        },
      ])
      .select(
        "id, owner_id, provider_id, name",
      ),
    "Insert demo accounts",
  );

  function accountFor(
    ownerId,
    providerId,
    name,
  ) {
    const account = accounts.find(
      (candidate) =>
        candidate.owner_id === ownerId &&
        candidate.provider_id === providerId &&
        candidate.name === name,
    );

    if (!account) {
      fail(
        `Unable to resolve demo account: ${name}`,
      );
    }

    return account;
  }

  const alexBrokerage = accountFor(
    alex.id,
    demoBroker.id,
    "Brokerage",
  );

  const alexRetirement = accountFor(
    alex.id,
    demoBroker.id,
    "Retirement",
  );

  const morganBrokerage = accountFor(
    morgan.id,
    demoBroker.id,
    "Brokerage",
  );

  const morganPension = accountFor(
    morgan.id,
    exampleFund.id,
    "Pension",
  );

  const instruments = unwrap(
    await userClient
      .from("instruments")
      .insert([
        {
          workspace_id: workspaceId,
          name: "Meridian Cloud Systems",
          ticker: "MCS",
          exchange: "DEMO",
          asset_class_id: equities.id,
          default_currency: "PLN",
          instrument_kind: "stock",
          tracking_mode: "units",
        },
        {
          workspace_id: workspaceId,
          name: "Horizon Global Equity ETF",
          ticker: "HGLO",
          exchange: "DEMO",
          asset_class_id: etfs.id,
          default_currency: "PLN",
          instrument_kind: "etf",
          tracking_mode: "units",
        },
        {
          workspace_id: workspaceId,
          name: "Oakline Property Trust",
          ticker: "OAKR",
          exchange: "DEMO",
          asset_class_id: realEstate.id,
          default_currency: "PLN",
          instrument_kind: "reit",
          tracking_mode: "units",
        },
        {
          workspace_id: workspaceId,
          name: "FuturePath Balanced Fund",
          ticker: "FPBF",
          exchange: null,
          asset_class_id: retirementFund.id,
          default_currency: "PLN",
          instrument_kind: "ppk_fund",
          tracking_mode: "balance",
        },
      ])
      .select("id, ticker"),
    "Insert demo instruments",
  );

  const mcs = by(
    instruments,
    "ticker",
    "MCS",
    "instrument",
  );

  const hglo = by(
    instruments,
    "ticker",
    "HGLO",
    "instrument",
  );

  const oakr = by(
    instruments,
    "ticker",
    "OAKR",
    "instrument",
  );

  const fpbf = by(
    instruments,
    "ticker",
    "FPBF",
    "instrument",
  );

  console.log(
    "Creating fictional opening state...",
  );

  const openingCash = [
    [alexBrokerage.id, 30000, "09:00:00"],
    [alexRetirement.id, 18000, "09:05:00"],
    [morganBrokerage.id, 22000, "09:10:00"],
  ];

  for (const [
    accountId,
    amount,
    operationTime,
  ] of openingCash) {
    await rpc(
      userClient,
      "create_opening_cash_balance",
      {
        p_account_id: accountId,
        p_operation_date: openingDate,
        p_amount: amount,
        p_currency: "PLN",
        p_base_value: null,
        p_description:
          "Fictional demo opening cash",
        p_notes: DEMO_NOTE,
        p_operation_time: operationTime,
      },
    );
  }

  const openingUnits = [
    [alexBrokerage.id, mcs.id, 20, "09:20:00"],
    [alexRetirement.id, hglo.id, 15, "09:25:00"],
    [morganBrokerage.id, hglo.id, 12, "09:30:00"],
    [morganBrokerage.id, oakr.id, 30, "09:35:00"],
  ];

  for (const [
    accountId,
    instrumentId,
    quantity,
    operationTime,
  ] of openingUnits) {
    await rpc(
      userClient,
      "create_opening_units_position",
      {
        p_account_id: accountId,
        p_instrument_id: instrumentId,
        p_operation_date: openingDate,
        p_quantity: quantity,
        p_description:
          "Fictional demo opening position",
        p_notes: DEMO_NOTE,
        p_operation_time: operationTime,
      },
    );
  }

  await rpc(
    userClient,
    "create_opening_reported_balance",
    {
      p_account_id: morganPension.id,
      p_instrument_id: fpbf.id,
      p_operation_date: openingDate,
      p_value_amount: 24000,
      p_currency: "PLN",
      p_base_value: null,
      p_description:
        "Fictional demo opening pension balance",
      p_notes: DEMO_NOTE,
      p_operation_time: "09:40:00",
    },
  );

  console.log(
    "Creating fictional recent operations...",
  );

  async function cashOperation(
    accountId,
    daysAgo,
    type,
    amount,
    description,
    time,
  ) {
    return rpc(
      userClient,
      "create_cash_operation",
      {
        p_account_id: accountId,
        p_operation_date:
          shiftIsoDate(today, daysAgo),
        p_operation_type: type,
        p_amount: amount,
        p_currency: "PLN",
        p_description: description,
        p_notes: DEMO_NOTE,
        p_operation_time: time,
      },
    );
  }

  async function trade(
    accountId,
    instrumentId,
    daysAgo,
    type,
    quantity,
    cashAmount,
    description,
    time,
  ) {
    return rpc(
      userClient,
      "create_trade_operation",
      {
        p_account_id: accountId,
        p_instrument_id: instrumentId,
        p_operation_date:
          shiftIsoDate(today, daysAgo),
        p_operation_type: type,
        p_quantity: quantity,
        p_actual_cash_amount: cashAmount,
        p_cash_currency: "PLN",
        p_fee_amount: null,
        p_tax_amount: null,
        p_base_value: null,
        p_description: description,
        p_notes: DEMO_NOTE,
        p_operation_time: time,
      },
    );
  }

  await cashOperation(
    alexBrokerage.id,
    -28,
    "deposit",
    5000,
    "Fictional demo contribution",
    "10:15:00",
  );

  await cashOperation(
    morganBrokerage.id,
    -25,
    "deposit",
    4000,
    "Fictional demo contribution",
    "11:10:00",
  );

  await trade(
    alexBrokerage.id,
    mcs.id,
    -20,
    "buy",
    5,
    4500,
    "Fictional MCS purchase",
    "10:30:00",
  );

  await trade(
    alexBrokerage.id,
    hglo.id,
    -18,
    "buy",
    3,
    2220,
    "Fictional HGLO purchase",
    "14:20:00",
  );

  await trade(
    morganBrokerage.id,
    oakr.id,
    -14,
    "buy",
    10,
    3200,
    "Fictional OAKR purchase",
    "12:05:00",
  );

  await trade(
    morganBrokerage.id,
    hglo.id,
    -10,
    "sell",
    2,
    1510,
    "Fictional HGLO sale",
    "15:10:00",
  );

  await trade(
    alexRetirement.id,
    hglo.id,
    -7,
    "buy",
    2,
    1500,
    "Fictional retirement HGLO purchase",
    "09:45:00",
  );

  await rpc(
    userClient,
    "create_internal_transfer",
    {
      p_from_account_id: alexBrokerage.id,
      p_to_account_id: alexRetirement.id,
      p_operation_date:
        shiftIsoDate(today, -5),
      p_amount: 1000,
      p_currency: "PLN",
      p_description:
        "Fictional internal cash transfer",
      p_notes: DEMO_NOTE,
      p_operation_time: "13:00:00",
    },
  );

  await cashOperation(
    alexBrokerage.id,
    -3,
    "interest",
    75,
    "Fictional cash interest",
    "08:15:00",
  );

  await cashOperation(
    morganBrokerage.id,
    -2,
    "fee",
    18,
    "Fictional account fee",
    "17:00:00",
  );

  console.log(
    "Creating fictional current valuations...",
  );

  const unitValuations = [
    [alexBrokerage.id, mcs.id, 25, 920],
    [alexBrokerage.id, hglo.id, 3, 760],
    [alexRetirement.id, hglo.id, 17, 760],
    [morganBrokerage.id, hglo.id, 10, 760],
    [morganBrokerage.id, oakr.id, 40, 335],
  ];

  for (const [
    accountId,
    instrumentId,
    quantity,
    unitPrice,
  ] of unitValuations) {
    await rpc(
      userClient,
      "upsert_position_snapshot",
      {
        p_account_id: accountId,
        p_instrument_id: instrumentId,
        p_snapshot_date: today,
        p_market_value:
          quantity * unitPrice,
        p_currency: "PLN",
        p_quantity: quantity,
        p_unit_price: unitPrice,
        p_market_value_base: null,
        p_notes: DEMO_NOTE,
      },
    );
  }

  await rpc(
    userClient,
    "upsert_position_snapshot",
    {
      p_account_id: morganPension.id,
      p_instrument_id: fpbf.id,
      p_snapshot_date: today,
      p_market_value: 25850,
      p_currency: "PLN",
      p_quantity: null,
      p_unit_price: null,
      p_market_value_base: null,
      p_notes: DEMO_NOTE,
    },
  );

  console.log("Validating fictional demo...");

  const membership = unwrap(
    await userClient
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .single(),
    "Validate demo membership",
  );

  if (membership.role !== "admin") {
    fail(
      "Demo user does not have admin workspace membership.",
    );
  }

  const [
    ownerCount,
    providerCount,
    accountCount,
    assetClassCount,
    instrumentCount,
    operationCount,
    unitPositionCount,
    reportedBalanceCount,
    cashBalanceCount,
  ] = await Promise.all([
    exactCount(
      userClient,
      "owners",
      workspaceId,
    ),
    exactCount(
      userClient,
      "providers",
      workspaceId,
    ),
    exactCount(
      userClient,
      "accounts",
      workspaceId,
    ),
    exactCount(
      userClient,
      "asset_classes",
      workspaceId,
    ),
    exactCount(
      userClient,
      "instruments",
      workspaceId,
    ),
    exactCount(
      userClient,
      "portfolio_operations",
      workspaceId,
    ),
    exactCount(
      userClient,
      "portfolio_current_valued_unit_positions",
      workspaceId,
    ),
    exactCount(
      userClient,
      "portfolio_current_reported_balances",
      workspaceId,
    ),
    exactCount(
      userClient,
      "portfolio_current_cash_balances",
      workspaceId,
    ),
  ]);

  const expected = {
    owners: [ownerCount, 2],
    providers: [providerCount, 2],
    accounts: [accountCount, 4],
    assetClasses: [assetClassCount, 4],
    instruments: [instrumentCount, 4],
    unitPositions: [unitPositionCount, 5],
    reportedBalances: [reportedBalanceCount, 1],
    cashBalances: [cashBalanceCount, 3],
  };

  for (
    const [label, [actual, wanted]]
    of Object.entries(expected)
  ) {
    if (actual !== wanted) {
      fail(
        `Demo validation failed for ${label}: expected ${wanted}, got ${actual}.`,
      );
    }
  }

  if (operationCount < 17) {
    fail(
      `Demo validation expected at least 17 operations, got ${operationCount}.`,
    );
  }

  await userClient.auth.signOut();

  console.log("");
  console.log(
    "==============================================",
  );
  console.log("LOCAL FICTIONAL DEMO READY");
  console.log(
    "==============================================",
  );
  console.log(`Workspace: ${DEMO_WORKSPACE}`);
  console.log(`As-of valuation date: ${today}`);
  console.log(`Operations: ${operationCount}`);
  console.log(
    `Unit positions: ${unitPositionCount}`,
  );
  console.log(
    `Reported balances: ${reportedBalanceCount}`,
  );
  console.log(`Cash balances: ${cashBalanceCount}`);
  console.log("");
  console.log("Local demo login:");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("");
  console.log(
    "These credentials are intentionally public and LOCAL-DEMO-ONLY.",
  );
  console.log(
    "The command does not modify .env.local. Point the Next.js app at the local Supabase URL and browser-safe key before opening the demo in the browser.",
  );
  console.log(
    "==============================================",
  );
}

main().catch((error) => {
  console.error("");
  console.error("LOCAL DEMO BOOTSTRAP FAILED");
  console.error(
    error instanceof Error
      ? error.message
      : String(error),
  );
  process.exit(1);
});
