"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  isValidIsoDate,
  isValidOperationTime,
  parsePositiveNumber,
  readText,
} from "../form-helpers";
import {
  isOperationCurrency,
} from "../operation-options";

const FUNDING_ROUTE_PATH =
  "/portfolio/operations/funding-route";

function redirectWithError(
  error: string,
): never {
  redirect(
    `${FUNDING_ROUTE_PATH}?error=${encodeURIComponent(
      error,
    )}`,
  );
}

export async function createFundingRoute(
  formData: FormData,
) {
  const supabase = await createClient();

  const { data: claimsData } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/portfolio/login");
  }

  const ownerId = readText(
    formData,
    "ownerId",
  );

  const contributionDate = readText(
    formData,
    "contributionDate",
  );

  const contributionTime = readText(
    formData,
    "contributionTime",
  );

  const contributionAmount =
    parsePositiveNumber(
      readText(
        formData,
        "contributionAmount",
      ),
    );

  const exchangeChannelId = readText(
    formData,
    "exchangeChannelId",
  );

  const exchangeToAmount =
    parsePositiveNumber(
      readText(
        formData,
        "exchangeToAmount",
      ),
    );

  const exchangeToCurrency = readText(
    formData,
    "exchangeToCurrency",
  ).toUpperCase();

  const rawExchangeFeeAmount = readText(
    formData,
    "exchangeFeeAmount",
  );

  let exchangeFeeAmount:
    | number
    | undefined;

  if (rawExchangeFeeAmount) {
    const parsedFee =
      parsePositiveNumber(
        rawExchangeFeeAmount,
      );

    if (parsedFee === null) {
      redirectWithError(
        "exchange_fee_invalid",
      );
    }

    exchangeFeeAmount = parsedFee;
  }

  const transferAmount =
    parsePositiveNumber(
      readText(
        formData,
        "transferAmount",
      ),
    );

  const intermediateChannelId =
    readText(
      formData,
      "intermediateChannelId",
    );

  const destinationAccountId =
    readText(
      formData,
      "destinationAccountId",
    );

  const arrivalDate = readText(
    formData,
    "arrivalDate",
  );

  const arrivalTime = readText(
    formData,
    "arrivalTime",
  );

  const depositDate = readText(
    formData,
    "depositDate",
    );

    const depositTime = readText(
    formData,
    "depositTime",
    );

  const destinationAmount =
    parsePositiveNumber(
      readText(
        formData,
        "destinationAmount",
      ),
    );

  const description = readText(
    formData,
    "description",
  );

  const notes = readText(
    formData,
    "notes",
  );

  if (!ownerId) {
    redirectWithError(
      "owner_required",
    );
  }

  if (
    !isValidIsoDate(
      contributionDate,
    )
  ) {
    redirectWithError(
      "contribution_date_invalid",
    );
  }

  if (
    contributionTime &&
    !isValidOperationTime(
      contributionTime,
    )
  ) {
    redirectWithError(
      "contribution_time_invalid",
    );
  }

  if (
    contributionAmount === null
  ) {
    redirectWithError(
      "contribution_amount_invalid",
    );
  }

  if (!exchangeChannelId) {
    redirectWithError(
      "exchange_channel_required",
    );
  }

  if (
    exchangeToAmount === null ||
    transferAmount === null
  ) {
    redirectWithError(
      "exchange_amount_invalid",
    );
  }

  if (
    !isOperationCurrency(
      exchangeToCurrency,
    )
  ) {
    redirectWithError(
      "exchange_currency_invalid",
    );
  }

  if (!destinationAccountId) {
    redirectWithError(
      "destination_account_required",
    );
  }

  if (
    !isValidIsoDate(
      arrivalDate,
    )
  ) {
    redirectWithError(
      "arrival_date_invalid",
    );
  }

  if (
    arrivalTime &&
    !isValidOperationTime(
      arrivalTime,
    )
  ) {
    redirectWithError(
      "arrival_time_invalid",
    );
  }

  if (!isValidIsoDate(depositDate)) {
  redirectWithError(
    "deposit_date_invalid",
  );
}

  if (
    depositTime &&
    !isValidOperationTime(
      depositTime,
    )
  ) {
    redirectWithError(
      "deposit_time_invalid",
    );
  }

  if (depositDate < arrivalDate) {
    redirectWithError(
      "deposit_before_arrival",
    );
  }

  if (
    depositDate === arrivalDate &&
    arrivalTime &&
    depositTime &&
    depositTime < arrivalTime
  ) {
    redirectWithError(
      "deposit_before_arrival",
    );
  }

  if (destinationAmount === null) {
    redirectWithError(
      "destination_amount_invalid",
    );
  }

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("workspace_members")
    .select(
      "workspace_id, role",
    )
    .order(
      "created_at",
      { ascending: true },
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    console.error(
      "Workspace membership query failed:",
      membershipError,
    );

    redirectWithError(
      "workspace_not_found",
    );
  }

  if (
    membership.role !== "admin" &&
    membership.role !== "editor"
  ) {
    redirectWithError(
      "forbidden",
    );
  }

  const [
    workspaceResult,
    ownerResult,
    destinationAccountResult,
    exchangeChannelResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select(
        "base_currency",
      )
      .eq(
        "id",
        membership.workspace_id,
      )
      .single(),

    supabase
      .from("owners")
      .select("id")
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq("id", ownerId)
      .maybeSingle(),

    supabase
      .from("accounts")
      .select(
        "id, owner_id, base_currency",
      )
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "id",
        destinationAccountId,
      )
      .eq("is_active", true)
      .maybeSingle(),

    supabase
      .from("exchange_channels")
      .select("id, name")
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "id",
        exchangeChannelId,
      )
      .maybeSingle(),
  ]);

  const workspace =
    workspaceResult.data;

  const owner =
    ownerResult.data;

  const destinationAccount =
    destinationAccountResult.data;

  const exchangeChannel =
    exchangeChannelResult.data;

  if (
    workspaceResult.error ||
    !workspace
  ) {
    console.error(
      "Workspace query failed:",
      workspaceResult.error,
    );

    redirectWithError(
      "workspace_not_found",
    );
  }

  if (
    ownerResult.error ||
    !owner
  ) {
    console.error(
      "Owner validation failed:",
      ownerResult.error,
    );

    redirectWithError(
      "owner_invalid",
    );
  }

  if (
    destinationAccountResult.error ||
    !destinationAccount
  ) {
    console.error(
      "Destination account validation failed:",
      destinationAccountResult.error,
    );

    redirectWithError(
      "destination_account_invalid",
    );
  }

  if (
    destinationAccount.owner_id !==
    ownerId
  ) {
    redirectWithError(
      "destination_owner_mismatch",
    );
  }

  if (
    exchangeChannelResult.error ||
    !exchangeChannel
  ) {
    console.error(
      "Exchange channel validation failed:",
      exchangeChannelResult.error,
    );

    redirectWithError(
      "exchange_channel_invalid",
    );
  }

  if (
    exchangeToCurrency ===
    workspace.base_currency
  ) {
    redirectWithError(
      "same_currency",
    );
  }

  if (
    destinationAccount.base_currency !==
    exchangeToCurrency
  ) {
    redirectWithError(
      "destination_currency_mismatch",
    );
  }

  let intermediateChannel:
    | {
        id: string;
        name: string;
      }
    | null = null;

  if (intermediateChannelId) {
    const {
      data,
      error,
    } = await supabase
      .from("exchange_channels")
      .select("id, name")
      .eq(
        "workspace_id",
        membership.workspace_id,
      )
      .eq(
        "id",
        intermediateChannelId,
      )
      .maybeSingle();

    if (error || !data) {
      console.error(
        "Intermediate channel validation failed:",
        error,
      );

      redirectWithError(
        "intermediate_channel_invalid",
      );
    }

    intermediateChannel = data;
  }

  const exchangeNetExpected =
    exchangeToAmount -
    (exchangeFeeAmount ?? 0);

  /*
   * A one-cent tolerance avoids failing on
   * ordinary decimal-entry rounding.
   */
  if (
    Math.abs(
      exchangeNetExpected -
        transferAmount,
    ) > 0.011
  ) {
    redirectWithError(
      "exchange_net_mismatch",
    );
  }

  const exchangeChannelName =
    exchangeChannel.name;

  const destinationLabel =
    "Tracked portfolio account";

  const steps: Array<{
    date: string;
    time?: string;
    stepType:
      | "exchange"
      | "transfer"
      | "arrival"
      | "other";
    exchangeChannelId?: string;
    fromLocation?: string;
    toLocation?: string;
    fromAmount?: number;
    fromCurrency?: string;
    toAmount?: number;
    toCurrency?: string;
    feeAmount?: number;
    feeCurrency?: string;
    notes?: string;
  }> = [];

  steps.push({
    date: contributionDate,
    time:
      contributionTime ||
      undefined,
    stepType: "exchange",
    exchangeChannelId:
      exchangeChannel.id,
    fromLocation:
      exchangeChannelName,
    toLocation:
      exchangeChannelName,
    fromAmount:
      contributionAmount,
    fromCurrency:
      workspace.base_currency,
    toAmount:
      exchangeToAmount,
    toCurrency:
      exchangeToCurrency,
    feeAmount:
      exchangeFeeAmount,
    feeCurrency:
      exchangeFeeAmount
        ? exchangeToCurrency
        : undefined,
    notes:
      "External contribution exchanged before reaching a tracked portfolio account.",
  });

  if (intermediateChannel) {
    steps.push({
      date: contributionDate,
      time:
        contributionTime ||
        undefined,
      stepType: "transfer",
      exchangeChannelId:
        intermediateChannel.id,
      fromLocation:
        exchangeChannelName,
      toLocation:
        intermediateChannel.name,
      fromAmount:
        transferAmount,
      fromCurrency:
        exchangeToCurrency,
      toAmount:
        transferAmount,
      toCurrency:
        exchangeToCurrency,
    });

    steps.push({
      date: arrivalDate,
      time:
        arrivalTime ||
        undefined,
      stepType: "arrival",
      exchangeChannelId:
        intermediateChannel.id,
      fromLocation:
        intermediateChannel.name,
      toLocation:
        destinationLabel,
      fromAmount:
        transferAmount,
      fromCurrency:
        exchangeToCurrency,
      toAmount:
        destinationAmount,
      toCurrency:
        destinationAccount.base_currency,
    });
  } else {
    steps.push({
      date: arrivalDate,
      time:
        arrivalTime ||
        undefined,
      stepType: "arrival",
      exchangeChannelId:
        exchangeChannel.id,
      fromLocation:
        exchangeChannelName,
      toLocation:
        destinationLabel,
      fromAmount:
        transferAmount,
      fromCurrency:
        exchangeToCurrency,
      toAmount:
        destinationAmount,
      toCurrency:
        destinationAccount.base_currency,
    });
  }

const {
  data: routeId,
  error,
} = await supabase.rpc(
  "create_completed_funding_route_with_deposit_time",
  {
    p_workspace_id:
      membership.workspace_id,
    p_owner_id:
      ownerId,
    p_contribution_date:
      contributionDate,
    p_contribution_time:
      contributionTime ||
      undefined,
    p_contribution_amount_base:
      contributionAmount,
    p_destination_account_id:
      destinationAccountId,
    p_destination_date:
      arrivalDate,
    p_destination_time:
      arrivalTime ||
      undefined,
    p_destination_amount:
      destinationAmount,
    p_destination_currency:
      destinationAccount.base_currency,
    p_steps:
      steps,
    p_deposit_date:
      depositDate,
    p_deposit_time:
      depositTime ||
      undefined,
    p_description:
      description ||
      undefined,
    p_notes:
      notes ||
      undefined,
  },
);

  if (error || !routeId) {
    console.error(
      "Funding route creation failed:",
      error,
    );

    redirectWithError(
      "creation_failed",
    );
  }

  revalidatePath(
    "/portfolio",
  );

  revalidatePath(
    "/portfolio/operations",
  );

  revalidatePath(
    "/portfolio/state",
  );

  revalidatePath(
    "/portfolio/reports/contributions",
  );

  redirect(
    `${FUNDING_ROUTE_PATH}?success=${encodeURIComponent(
      routeId,
    )}`,
  );
}