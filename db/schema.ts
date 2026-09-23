import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,uniqueIndex,check} from 'drizzle-orm/sqlite-core';
export const movementSnapshots=sqliteTable('movement_snapshots',{
  id:text('id').primaryKey(),
  eventId:text('event_id').notNull(),
  capturedAt:integer('captured_at').notNull(),
  kind:text('kind').notNull(),
  payloadJson:text('payload_json').notNull(),
},table=>[index('movement_event_time').on(table.eventId,table.capturedAt),index('movement_expiry').on(table.capturedAt)]);

export const userProfiles=sqliteTable('user_profiles',{
  authUserId:text('auth_user_id').primaryKey(),
  email:text('email').notNull(),
  displayName:text('display_name'),
  plan:text('plan').notNull().default('free'),
  subscriptionStatus:text('subscription_status').notNull().default('inactive'),
  entitlementExpiresAt:text('entitlement_expires_at'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},table=>[
  check('user_profiles_plan_check',sql`${table.plan} in ('free','premium','admin')`),
  check('user_profiles_subscription_check',sql`${table.subscriptionStatus} in ('inactive','trialing','active','past_due','canceled')`),
]);

export const userPreferences=sqliteTable('user_preferences',{
  authUserId:text('auth_user_id').primaryKey().references(()=>userProfiles.authUserId,{onDelete:'cascade'}),
  preferencesJson:text('preferences_json').notNull().default('{}'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
});

export const userSavedItems=sqliteTable('user_saved_items',{
  id:text('id').primaryKey(),
  authUserId:text('auth_user_id').notNull().references(()=>userProfiles.authUserId,{onDelete:'cascade'}),
  itemType:text('item_type').notNull(),
  fingerprint:text('fingerprint').notNull(),
  snapshotJson:text('snapshot_json').notNull(),
  createdAt:text('created_at').notNull(),
},table=>[
  uniqueIndex('user_saved_items_user_fingerprint').on(table.authUserId,table.fingerprint),
  index('user_saved_items_user_created').on(table.authUserId,table.createdAt),
  check('user_saved_items_type_check',sql`${table.itemType} in ('prop','parlay')`),
]);

export const userBets=sqliteTable('user_bets',{
  id:text('id').primaryKey(),
  authUserId:text('auth_user_id').notNull().references(()=>userProfiles.authUserId,{onDelete:'cascade'}),
  betType:text('bet_type').notNull(),
  source:text('source').notNull().default('board'),
  title:text('title'),
  sportsbook:text('sportsbook'),
  stakeCents:integer('stake_cents').notNull(),
  americanOdds:integer('american_odds').notNull(),
  potentialPayoutCents:integer('potential_payout_cents').notNull(),
  profitLossCents:integer('profit_loss_cents'),
  gameStart:text('game_start'),
  status:text('status').notNull().default('pending'),
  result:text('result').notNull().default('pending'),
  verificationStatus:text('verification_status').notNull().default('timestamped'),
  snapshotJson:text('snapshot_json').notNull().default('{}'),
  lockedAt:text('locked_at'),
  gradedAt:text('graded_at'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},table=>[
  index('user_bets_user_created').on(table.authUserId,table.createdAt),
  index('user_bets_user_status').on(table.authUserId,table.status,table.gameStart),
  check('user_bets_type_check',sql`${table.betType} in ('single','parlay')`),
  check('user_bets_source_check',sql`${table.source} in ('board','manual','imported')`),
  check('user_bets_status_check',sql`${table.status} in ('pending','provisional','final')`),
  check('user_bets_result_check',sql`${table.result} in ('pending','won','lost','push','void')`),
]);

export const userBetLegs=sqliteTable('user_bet_legs',{
  id:text('id').primaryKey(),
  betId:text('bet_id').notNull().references(()=>userBets.id,{onDelete:'cascade'}),
  authUserId:text('auth_user_id').notNull().references(()=>userProfiles.authUserId,{onDelete:'cascade'}),
  ordinal:integer('ordinal').notNull(),
  eventId:text('event_id'),
  player:text('player').notNull(),
  team:text('team'),
  opponent:text('opponent'),
  market:text('market').notNull(),
  side:text('side').notNull(),
  line:text('line'),
  americanOdds:integer('american_odds').notNull(),
  gameStart:text('game_start'),
  actualValue:text('actual_value'),
  result:text('result').notNull().default('pending'),
  gradingNote:text('grading_note'),
  snapshotJson:text('snapshot_json').notNull().default('{}'),
  createdAt:text('created_at').notNull(),
},table=>[
  uniqueIndex('user_bet_legs_bet_ordinal').on(table.betId,table.ordinal),
  index('user_bet_legs_user_game').on(table.authUserId,table.gameStart),
  check('user_bet_legs_result_check',sql`${table.result} in ('pending','won','lost','push','void')`),
]);
