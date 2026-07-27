const relationshipLabels = {
  relacionamento_serio: "Em um relacionamento serio",
  casada: "Casada",
  solteira: "Solteira",
  noiva: "Noiva",
  prefere_nao_dizer: "Prefere nao dizer",
};

function getRelationshipLabel(value) {
  return relationshipLabels[value] || "";
}

function formatProfileDate(value) {
  if (!value) return "";

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;

  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function PersonalIcon({ type }) {
  const paths = {
    cake: (
      <>
        <path d="M4 20h16v-7H4v7Z" />
        <path d="M4 15h16" />
        <path d="M8 13V9" />
        <path d="M12 13V8" />
        <path d="M16 13V9" />
        <path d="M8 6v1" />
        <path d="M12 5v1" />
        <path d="M16 6v1" />
      </>
    ),
    heart: (
      <path d="M20.3 5.7a5 5 0 0 0-7.1 0L12 6.9l-1.2-1.2a5 5 0 0 0-7.1 7.1L12 21l8.3-8.2a5 5 0 0 0 0-7.1Z" />
    ),
    home: (
      <>
        <path d="M3 11 12 4l9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    pin: (
      <>
        <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
        <path d="M12 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="personal-icon" viewBox="0 0 24 24">
      {paths[type]}
    </svg>
  );
}

function ProfilePersonalDetails({ profile, showEmpty = false }) {
  const rows = [
    {
      fallback: "Informe onde voce mora",
      icon: "pin",
      label: profile?.city ? `Mora em ${profile.city}` : "",
    },
    {
      fallback: "Informe sua cidade natal",
      icon: "home",
      label: profile?.hometown ? `De ${profile.hometown}` : "",
    },
    {
      fallback: "Informe sua data de nascimento",
      icon: "cake",
      label: profile?.birth_date ? formatProfileDate(profile.birth_date) : "",
    },
    {
      fallback: "Informe seu relacionamento",
      icon: "heart",
      label: getRelationshipLabel(profile?.relationship_status),
    },
  ].filter((row) => showEmpty || row.label);

  if (rows.length === 0) {
    return <p className="empty-state">Dados pessoais ainda nao preenchidos.</p>;
  }

  return (
    <div className="personal-summary">
      {rows.map((row) => (
        <p key={row.icon}>
          <PersonalIcon type={row.icon} />
          <span>{row.label || row.fallback}</span>
        </p>
      ))}
    </div>
  );
}

export default ProfilePersonalDetails;
