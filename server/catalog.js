import { generatedWeaponCatalog } from "./riven-weapons.generated.js";

export const weaponCatalog = generatedWeaponCatalog;

export function findWeaponCatalogEntry(familyOrLabel = "") {
  const needle = String(familyOrLabel).trim();
  return weaponCatalog.find(weapon => weapon.family === needle || weapon.zh === needle);
}

export const statCatalog = [
  { key: "", en: "No preference", zh: "不限定", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "additional_combo_count_chance", en: "Additional Combo Count Chance", zh: "额外连击数几率", groups: ["melee"] },
  { key: "ammo_maximum", en: "Ammo Maximum", zh: "弹药上限", groups: ["rifle", "shotgun", "pistol", "archgun", "robotic"] },
  { key: "damage_vs_corpus", en: "Damage to Corpus", zh: "对 Corpus 伤害", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "damage_vs_grineer", en: "Damage to Grineer", zh: "对 Grineer 伤害", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "damage_vs_infested", en: "Damage to Infested", zh: "对 Infested 伤害", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "cold", en: "Cold Damage", zh: "冰冻伤害", positiveOnly: true, groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "combo_duration", en: "Combo Duration", zh: "连击持续时间", groups: ["melee"] },
  { key: "critical_chance", en: "Critical Chance", zh: "暴击几率", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "critical_chance_slide", en: "Critical Chance on Slide Attack", zh: "滑行攻击暴击几率", groups: ["melee"] },
  { key: "critical_damage", en: "Critical Damage", zh: "暴击伤害", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "damage", en: "Base Damage", zh: "基础伤害", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "electricity", en: "Electricity Damage", zh: "电击伤害", positiveOnly: true, groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "heat", en: "Heat Damage", zh: "火焰伤害", positiveOnly: true, groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "finisher_damage", en: "Finisher Damage", zh: "处决伤害", groups: ["melee"] },
  { key: "fire_rate", en: "Fire Rate / Attack Speed", zh: "射速 / 攻击速度", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "projectile_speed", en: "Projectile Speed", zh: "投射物速度", groups: ["rifle", "shotgun", "pistol", "archgun", "robotic"] },
  { key: "heavy_attack_efficiency", en: "Heavy Attack Efficiency", zh: "重击效率", groups: ["melee"] },
  { key: "impact", en: "Impact Damage", zh: "冲击伤害", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "initial_combo", en: "Initial Combo", zh: "初始连击", groups: ["melee"] },
  { key: "magazine_capacity", en: "Magazine Capacity", zh: "弹匣容量", groups: ["rifle", "shotgun", "pistol", "archgun", "robotic"] },
  { key: "multishot", en: "Multishot", zh: "多重射击", groups: ["rifle", "shotgun", "pistol", "archgun", "robotic"] },
  { key: "toxin", en: "Toxin Damage", zh: "毒素伤害", positiveOnly: true, groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "punch_through", en: "Punch Through", zh: "穿透", positiveOnly: true, groups: ["rifle", "shotgun", "pistol", "archgun", "robotic"] },
  { key: "puncture", en: "Puncture Damage", zh: "穿刺伤害", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "reload_speed", en: "Reload Speed", zh: "装填速度", groups: ["rifle", "shotgun", "pistol", "archgun", "robotic"] },
  { key: "range", en: "Range", zh: "范围", groups: ["melee"] },
  { key: "slash", en: "Slash Damage", zh: "切割伤害", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "status_chance", en: "Status Chance", zh: "触发几率", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "status_duration", en: "Status Duration", zh: "触发时间", groups: ["rifle", "shotgun", "pistol", "melee", "archgun", "robotic"] },
  { key: "recoil", en: "Recoil", zh: "后坐力", groups: ["rifle", "shotgun", "pistol", "archgun", "robotic"] },
  { key: "zoom", en: "Zoom", zh: "变焦", groups: ["rifle", "shotgun", "pistol", "archgun", "robotic"] }
];
