"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { fetchCategories } from "../../lib/catalog";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Select from "../ui/Select";
import PreferencePicker from "./PreferencePicker";

const DEFAULT_SIZE_OPTIONS = {
  เสื้อ: ["XS", "S", "M", "L", "XL", "XXL", "Free size"],
  รองเท้า: [
    "35",
    "36",
    "37",
    "38",
    "39",
    "40",
    "41",
    "42",
    "43",
    "44",
    "45",
    "46",
  ],
};
const DEFAULT_SIZE_GROUPS = Object.keys(DEFAULT_SIZE_OPTIONS);
const EXTRA_SIZE_GROUPS = ["กางเกง", "กระเป๋า", "หมวก"];

const EMPTY = {
  categories: [],
  styles: [],
  brands: [],
  sizes: [],
  unassignedSizes: [],
};
const FIELDS = [
  { name: "categories", label: "หมวดสินค้าที่ชอบ", options: "categories" },
  { name: "styles", label: "สไตล์ที่ชอบ", options: "styles" },
  { name: "brands", label: "แบรนด์ที่ชอบ", options: "brands" },
];

function toForm(profile) {
  if (
    !profile ||
    Object.keys(EMPTY).some((key) => !Array.isArray(profile[key]))
  ) {
    throw new Error(
      "รูปแบบข้อมูลความสนใจไม่ตรงกับรุ่นปัจจุบัน กรุณาตรวจสอบ Auth Service และ migration",
    );
  }
  return profile;
}

function SizeGroup({
  category,
  selected,
  available,
  disabled,
  onChange,
  onRemove,
}) {
  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <PreferencePicker
        label={`ขนาด: ${category}`}
        values={available}
        selected={selected}
        disabled={disabled}
        onChange={onChange}
        customSizeGroup={category}
      />
      {onRemove && (
        <Button variant="ghost" disabled={disabled} onClick={onRemove}>
          ลบกลุ่มขนาด {category}
        </Button>
      )}
    </div>
  );
}

export default function StyleProfileForm() {
  const [form, setForm] = useState(EMPTY);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const [additionalGroups, setAdditionalGroups] = useState([]);
  const [groupDraft, setGroupDraft] = useState("");
  const [sizeReset, setSizeReset] = useState(0);
  const sizeGroups = [
    ...new Set([
      ...DEFAULT_SIZE_GROUPS,
      ...additionalGroups,
      ...form.sizes.map((group) => group.category),
    ]),
  ];
  const availableGroups = [
    ...new Set([
      ...EXTRA_SIZE_GROUPS,
      ...(Array.isArray(options.categories) ? options.categories : []),
      ...(options.sizesByCategory || []).map((group) => group.category),
    ]),
  ].filter((category) => !sizeGroups.includes(category));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    const token = getAccessToken();
    Promise.all([
      apiFetch("/api/auth/me/style-profile", { token }),
      fetchCategories(),
      apiFetch("/api/products/filters", { token }),
    ])
      .then(([profile, categories, filters]) => {
        if (!active) return;
        if (!Array.isArray(filters?.sizesByCategory))
          throw new Error(
            "กรุณาปรับปรุง Product Service ให้รองรับขนาดแยกหมวดสินค้า",
          );
        const loaded = toForm(profile);
        setForm(loaded);
        setAdditionalGroups(
          loaded.sizes
            .map((group) => group.category)
            .filter((category) => !DEFAULT_SIZE_GROUPS.includes(category)),
        );
        setOptions({ ...filters, categories });
      })
      .catch((err) => {
        if (active) setLoadError(err.message || "โหลดความสนใจไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  function edit(update) {
    setForm(update);
    setNotice("");
    setSaveError("");
  }

  function toggle(field, value) {
    edit((current) => {
      const values = current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value];
      return { ...current, [field]: values };
    });
  }

  function setSizeValues(category, values) {
    edit((current) => ({
      ...current,
      sizes: [
        ...current.sizes.filter((group) => group.category !== category),
        ...(values.length ? [{ category, values }] : []),
      ],
    }));
  }

  function addGroup() {
    if (saving || !availableGroups.includes(groupDraft)) return;
    setAdditionalGroups((groups) => [...groups, groupDraft]);
    setGroupDraft("");
    setNotice("");
  }

  function removeGroup(category) {
    setAdditionalGroups((groups) =>
      groups.filter((group) => group !== category),
    );
    edit((current) => ({
      ...current,
      sizes: current.sizes.filter((group) => group.category !== category),
    }));
  }

  function assignLegacySize(value, category) {
    if (!category) return;
    edit((current) => {
      const previous =
        current.sizes.find((group) => group.category === category)?.values ||
        [];
      return {
        ...current,
        unassignedSizes: current.unassignedSizes.filter(
          (item) => item !== value,
        ),
        sizes: [
          ...current.sizes.filter((group) => group.category !== category),
          { category, values: [...new Set([...previous, value])] },
        ],
      };
    });
  }

  async function save(event) {
    event.preventDefault();
    if (saving || loading || loadError) return;
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const profile = await apiFetch("/api/auth/me/style-profile", {
        method: "PATCH",
        token: getAccessToken(),
        body: form,
      });
      setForm(toForm(profile));
      setNotice("บันทึกความสนใจสำเร็จ");
    } catch (err) {
      setSaveError(err.message || "บันทึกความสนใจไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="style-profile-heading"
      className="mt-8 border-t border-line pt-6"
    >
      <h2
        id="style-profile-heading"
        className="text-lg font-bold text-gray-900"
      >
        ความสนใจของฉัน
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        เลือกได้หลายรายการในทุกช่อง หรือเว้นว่างได้
        ข้อมูลนี้เตรียมไว้สำหรับระบบแนะนำสินค้า ไม่บังคับตั้งค่าก่อนซื้อสินค้า
      </p>
      {loading ? (
        <p role="status" className="mt-4 text-sm text-ink-muted">
          กำลังโหลดความสนใจ...
        </p>
      ) : loadError ? (
        <div className="mt-4 space-y-3">
          <Alert tone="error">{loadError}</Alert>
          <Button
            variant="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            โหลดความสนใจอีกครั้ง
          </Button>
        </div>
      ) : (
        <form onSubmit={save} className="mt-5 max-w-2xl space-y-6">
          {saveError && <Alert tone="error">{saveError}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
          {FIELDS.map(({ name, label, options: key }) => (
            <PreferencePicker
              key={name}
              label={label}
              selected={form[name]}
              values={[
                ...new Set([
                  ...(Array.isArray(options[key]) ? options[key] : []),
                  ...form[name],
                ]),
              ]}
              disabled={saving}
              onChange={(values) =>
                edit((current) => ({ ...current, [name]: values }))
              }
            />
          ))}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">
              ขนาดที่ต้องการ
            </h3>
            <p className="text-xs text-ink-muted">
              ตั้งขนาดเสื้อและรองเท้าได้ทันที ไม่ต้องเลือกหมวดสินค้าที่ชอบก่อน
              เลือกประเภทสินค้าเพื่อเพิ่มกลุ่มขนาด หรือเพิ่มไซซ์อื่นเองได้
              โดยไม่เปลี่ยนหมวดสินค้าที่ชอบ
            </p>
            {sizeGroups.map((category) => {
              const selected =
                form.sizes.find((group) => group.category === category)
                  ?.values || [];
              const catalogSizes =
                options.sizesByCategory?.find(
                  (group) => group.category === category,
                )?.values || [];
              const available = [
                ...new Set([
                  ...(Object.hasOwn(DEFAULT_SIZE_OPTIONS, category)
                    ? DEFAULT_SIZE_OPTIONS[category]
                    : []),
                  ...catalogSizes,
                ]),
              ];
              return (
                <SizeGroup
                  key={`${category}-${sizeReset}`}
                  category={category}
                  selected={selected}
                  available={available}
                  disabled={saving}
                  onChange={(values) => setSizeValues(category, values)}
                  onRemove={
                    DEFAULT_SIZE_GROUPS.includes(category)
                      ? undefined
                      : () => removeGroup(category)
                  }
                />
              );
            })}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1">
                <Select
                  id="additional-size-group"
                  label="ประเภทสินค้าที่ต้องการเพิ่ม"
                  value={groupDraft}
                  options={[
                    {
                      value: "",
                      label: availableGroups.length
                        ? "เลือกประเภทสินค้า"
                        : "เพิ่มครบทุกประเภทแล้ว",
                    },
                    ...availableGroups.map((category) => ({
                      value: category,
                      label: category,
                    })),
                  ]}
                  disabled={saving || !availableGroups.length}
                  onChange={(event) => setGroupDraft(event.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={saving || !availableGroups.includes(groupDraft)}
                onClick={addGroup}
              >
                เพิ่มกลุ่มขนาด
              </Button>
            </div>
            <p className="text-xs text-ink-muted">
              กลุ่มเพิ่มเติมจะบันทึกเมื่อมีไซซ์ที่เลือกหรือเพิ่มไว้
            </p>
          </div>
          {!!form.unassignedSizes.length && (
            <div className="space-y-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
              <p className="text-sm font-semibold">ขนาดเดิมที่ยังไม่ระบุหมวด</p>
              <p className="text-xs">
                ระบบเก็บค่าเดิมไว้โดยไม่เดาหมวดสินค้า เลือกหมวดให้แต่ละขนาด
                หรือเอาค่าที่ไม่ต้องการออก
              </p>
              {form.unassignedSizes.map((value) => (
                <div key={value} className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[180px] flex-1">
                    <Select
                      id={`legacy-size-${encodeURIComponent(value)}`}
                      label={`หมวดของขนาดเดิม ${value}`}
                      value=""
                      options={[
                        { value: "", label: "ยังไม่ระบุหมวด" },
                        ...sizeGroups.map((category) => ({
                          value: category,
                          label: category,
                        })),
                      ]}
                      disabled={saving}
                      onChange={(event) =>
                        assignLegacySize(value, event.target.value)
                      }
                    />
                  </div>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() => toggle("unassignedSizes", value)}
                  >
                    เอาขนาดเดิม {value} ออก
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-muted">
            หลังแก้ไขหรือล้างค่า กดบันทึกความสนใจเพื่อเก็บการเปลี่ยนแปลง
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={saving} icon="save">
              {saving ? "กำลังบันทึกความสนใจ..." : "บันทึกความสนใจ"}
            </Button>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                edit(EMPTY);
                setAdditionalGroups([]);
                setGroupDraft("");
                setSizeReset((value) => value + 1);
              }}
            >
              ล้างความสนใจทั้งหมด
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
