<script setup lang="ts">
import { computed, ref } from "vue";

type LeaderboardColumn = {
  key: string;
  label: string;
  unit?: string;
  lowerIsBetter?: boolean;
};

type LeaderboardRow = {
  name: string;
  org?: string;
  open?: boolean;
  note?: string;
  categories?: string[];
  values: Record<string, number | string | null>;
};

type LeaderboardSpec = {
  ariaLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  updated?: string;
  evidence?: string;
  columns: LeaderboardColumn[];
  categories?: string[];
  organizations?: string[];
  rows: LeaderboardRow[];
  footnote?: string;
  source?: string;
  sourceUrl?: string;
  sourceLabel?: string;
};

const props = defineProps<{ spec: string }>();
const board = computed<LeaderboardSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const query = ref("");
const openOnly = ref(false);
const selectedOrganization = ref("全部机构");
const activeCategory = ref("全部");
const sortKey = ref(board.value.columns[0]?.key ?? "overall");
const sortDescending = ref(true);

const organizations = computed(() => board.value.organizations ?? ["全部机构", ...new Set(board.value.rows.map((row) => row.org).filter(Boolean) as string[])]);
const categories = computed(() => board.value.categories ?? ["全部"]);

const visibleRows = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase();
  const column = board.value.columns.find((item) => item.key === sortKey.value) ?? board.value.columns[0];
  return board.value.rows
    .filter((row) => !normalizedQuery || `${row.name} ${row.org ?? ""}`.toLowerCase().includes(normalizedQuery))
    .filter((row) => !openOnly.value || row.open)
    .filter((row) => selectedOrganization.value === "全部机构" || row.org === selectedOrganization.value)
    .sort((left, right) => {
      const leftValue = left.values[column?.key ?? ""];
      const rightValue = right.values[column?.key ?? ""];
      const direction = sortDescending.value ? -1 : 1;
      if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * direction;
      return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "zh-CN", { numeric: true }) * direction;
    });
});

function selectColumn(column: LeaderboardColumn) {
  if (sortKey.value === column.key) {
    sortDescending.value = !sortDescending.value;
  } else {
    sortKey.value = column.key;
    sortDescending.value = !column.lowerIsBetter;
  }
}

function selectCategory(category: string) {
  activeCategory.value = category;
  const column = category === "全部"
    ? board.value.columns[0]
    : board.value.columns.find((item) => item.label === category);
  if (!column) return;
  sortKey.value = column.key;
  sortDescending.value = !column.lowerIsBetter;
}

function displayValue(value: number | string | null | undefined, column: LeaderboardColumn) {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${column.unit ?? ""}`;
}

function heatStyle(value: number | string | null | undefined, column: LeaderboardColumn) {
  if (typeof value !== "number") return {};
  const numbers = board.value.rows
    .map((row) => row.values[column.key])
    .filter((item): item is number => typeof item === "number");
  if (numbers.length < 2) return {};
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const ratio = column.lowerIsBetter ? (max - value) / span : (value - min) / span;
  return { "--benchmark-cell-alpha": `${0.06 + ratio * 0.2}` };
}
</script>

<template>
  <section class="benchmark-leaderboard" :aria-label="board.ariaLabel">
    <header class="benchmark-leaderboard-header">
      <p class="benchmark-leaderboard-eyebrow">{{ board.eyebrow }}</p>
      <h2>{{ board.title }}</h2>
      <p class="benchmark-leaderboard-subtitle">{{ board.subtitle }}</p>
      <p v-if="board.updated || board.evidence" class="benchmark-leaderboard-meta">
        <span v-if="board.updated">快照 {{ board.updated }}</span>
        <span v-if="board.evidence">证据 {{ board.evidence }}</span>
      </p>
    </header>

    <div class="benchmark-leaderboard-controls" role="group" aria-label="榜单筛选">
      <label class="benchmark-leaderboard-search">
        <span class="sr-only">搜索模型</span>
        <input v-model="query" type="search" placeholder="搜索模型..." />
      </label>
      <button
        type="button"
        class="benchmark-leaderboard-toggle"
        :class="{ active: openOnly }"
        :aria-pressed="openOnly"
        @click="openOnly = !openOnly"
      >
        Open weights
      </button>
      <label class="benchmark-leaderboard-org">
        <span class="sr-only">筛选机构</span>
        <select v-model="selectedOrganization">
          <option v-for="organization in organizations" :key="organization" :value="organization">{{ organization }}</option>
        </select>
      </label>
    </div>

    <div v-if="categories.length > 1" class="benchmark-leaderboard-categories" role="group" aria-label="能力分类">
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="benchmark-leaderboard-chip"
        :class="{ active: activeCategory === category }"
        :aria-pressed="activeCategory === category"
        @click="selectCategory(category)"
      >
        {{ category }}
      </button>
    </div>

    <div class="benchmark-leaderboard-scroll">
      <table>
        <caption class="sr-only">{{ board.title }}</caption>
        <thead>
          <tr>
            <th scope="col">模型</th>
            <th
              v-for="column in board.columns"
              :key="column.key"
              scope="col"
              :aria-sort="sortKey === column.key ? (sortDescending ? 'descending' : 'ascending') : 'none'"
            >
              <button type="button" class="benchmark-leaderboard-sort" @click="selectColumn(column)">
                {{ column.label }}<span aria-hidden="true">{{ sortKey === column.key ? (sortDescending ? ' ↓' : ' ↑') : '' }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.name">
            <th scope="row" class="benchmark-leaderboard-model">
              <span>
                <strong>{{ row.name }}</strong>
                <small v-if="row.note || row.org">{{ row.note }}{{ row.note && row.org ? " · " : "" }}{{ row.org }}</small>
              </span>
              <span v-if="row.open" class="benchmark-leaderboard-open">open</span>
            </th>
            <td
              v-for="column in board.columns"
              :key="column.key"
              :class="{ highlight: sortKey === column.key }"
              :style="heatStyle(row.values[column.key], column)"
            >
              {{ displayValue(row.values[column.key], column) }}
            </td>
          </tr>
          <tr v-if="visibleRows.length === 0">
            <td class="benchmark-leaderboard-empty" :colspan="board.columns.length + 1">没有符合筛选条件的模型</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer v-if="board.footnote || board.source" class="benchmark-leaderboard-footer">
      <p v-if="board.footnote">{{ board.footnote }}</p>
      <p v-if="board.source" class="benchmark-leaderboard-source">
        <span>{{ board.source }}</span>
        <a v-if="board.sourceUrl" :href="board.sourceUrl" target="_blank" rel="noreferrer">{{ board.sourceLabel ?? "打开官方榜单" }} ↗</a>
      </p>
    </footer>
  </section>
</template>
