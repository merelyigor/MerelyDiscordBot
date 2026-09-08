# Graph Report - .  (2026-09-08)

## Corpus Check
- Corpus is ~4,377 words - fits in a single context window. You may not need a graph.

## Summary
- 93 nodes · 136 edges · 10 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 73 · imports: 36 · imports_from: 20 · calls: 7


## Input Scope
- Requested: tracked
- Resolved: tracked (source: cli)
- Included files: 20 · Candidates: 57
- Excluded: 1 untracked · 6571 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `17692ca`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `loadConfig()` - 4 edges
2. `matchRules()` - 4 edges
3. `canAccessChannel()` - 3 edges
4. `pickChannelId()` - 3 edges
5. `BotConfig` - 3 edges
6. `getDailyQuote()` - 3 edges
7. `getRandomMotivation()` - 3 edges
8. `buildPollEmbed()` - 3 edges
9. `sendPoll()` - 3 edges
10. `createReminder()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.14
Nodes (8): AfkStatus, getAfkStatus(), removeAfk(), setAfk(), client, config, __dirname, instanceId

### Community 1 - "Community 1"
Cohesion: 0.20
Nodes (13): buildRegExp(), __dirname, extractMentionTarget(), formatMentionReply(), getRules(), MatchResult, matchRules(), MentionTarget (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.25
Nodes (7): commands, registerCommands(), BotConfig, loadConfig(), required(), connectDatabase(), validEnv

### Community 3 - "Community 3"
Cohesion: 0.22
Nodes (9): DailyTargets, __dirname, getDailyQuote(), pickRandom(), Quote, quotes, require, startDailyQuoteTimer() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.32
Nodes (5): canAccessChannel(), PermissionChannel, pickChannelId(), ChannelPair, member

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (7): buildHelpEmbed(), __dirname, escapeRegex(), formatPattern(), require, Rule, rules

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (6): __dirname, getRandomMotivation(), MotivationResult, quotes, RawQuote, require

### Community 7 - "Community 7"
Cohesion: 0.38
Nodes (5): createReminder(), loadPendingReminders(), Reminder, scheduleReminder(), timers

### Community 8 - "Community 8"
Cohesion: 0.60
Nodes (3): buildPollEmbed(), POLL_EMOJIS, sendPoll()

### Community 9 - "Community 9"
Cohesion: 1.00
Nodes (1): maxAgeSeconds

## Knowledge Gaps
- **33 isolated node(s):** `AfkStatus`, `PermissionChannel`, `commands`, `__dirname`, `require` (+28 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 9`** (1 nodes): `maxAgeSeconds`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `loadConfig()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `canAccessChannel()` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `pickChannelId()` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `AfkStatus`, `PermissionChannel`, `commands` to the rest of the system?**
  _33 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13970588235294118 - nodes in this community are weakly interconnected._