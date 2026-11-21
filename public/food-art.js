// Crisp bespoke food illustrations & photo wrapper for K-Snack POS & Kiosk
(function (root) {
  const ARTWORK = {
    cupbap_chicken: `
      <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" class="food-svg">
        <defs>
          <linearGradient id="bg-cupbap" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#F8EFE2"/>
            <stop offset="100%" stop-color="#EAD8C0"/>
          </linearGradient>
          <linearGradient id="bowl-dark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2D2926"/>
            <stop offset="100%" stop-color="#171513"/>
          </linearGradient>
          <linearGradient id="chicken-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#E59A3C"/>
            <stop offset="100%" stop-color="#B9651B"/>
          </linearGradient>
        </defs>
        <rect width="320" height="220" fill="url(#bg-cupbap)"/>
        <ellipse cx="160" cy="186" rx="92" ry="18" fill="rgba(45,30,15,0.14)"/>
        <path d="M84 96 L236 96 L216 178 C214 185 190 190 160 190 C130 190 106 185 104 178 Z" fill="url(#bowl-dark)"/>
        <ellipse cx="160" cy="96" rx="76" ry="24" fill="#3D3733"/>
        <ellipse cx="160" cy="94" rx="70" ry="20" fill="#FCFBF7"/>
        <!-- Seasoned rice grains texture -->
        <g fill="#EFECE2">
          <ellipse cx="122" cy="92" rx="8" ry="4"/><ellipse cx="145" cy="86" rx="7" ry="4"/>
          <ellipse cx="188" cy="89" rx="9" ry="4"/><ellipse cx="166" cy="98" rx="8" ry="4"/>
        </g>
        <!-- Scrambled egg strips -->
        <path d="M104 94 C112 78 134 76 146 92 C136 102 114 103 104 94 Z" fill="#F8C846"/>
        <path d="M116 86 C126 80 138 84 140 93" stroke="#E2A420" stroke-width="2" fill="none"/>
        <!-- Crispy chicken bites -->
        <circle cx="165" cy="86" r="15" fill="url(#chicken-gold)"/>
        <circle cx="185" cy="92" r="14" fill="url(#chicken-gold)"/>
        <circle cx="152" cy="98" r="13" fill="#D4822A"/>
        <circle cx="174" cy="100" r="12" fill="#CA7622"/>
        <!-- Seaweed strips -->
        <rect x="196" y="80" width="20" height="5" rx="2" transform="rotate(-14 196 80)" fill="#1E2B1E"/>
        <rect x="192" y="88" width="22" height="5" rx="2" transform="rotate(8 192 88)" fill="#1E2B1E"/>
        <!-- Mayo drizzle -->
        <path d="M142 84 Q158 76 170 86 T194 88 T156 98" stroke="#FFF6DF" stroke-width="3.5" stroke-linecap="round" fill="none"/>
        <!-- Teriyaki glaze -->
        <path d="M146 91 Q164 84 178 94 T198 96" stroke="#5E2610" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <!-- Scallions & sesame -->
        <circle cx="155" cy="84" r="2.2" fill="#468C48"/><circle cx="177" cy="86" r="2.2" fill="#468C48"/>
        <circle cx="164" cy="94" r="1.5" fill="#FFF3D1"/><circle cx="183" cy="96" r="1.5" fill="#FFF3D1"/>
        <text x="160" y="148" text-anchor="middle" fill="#F4C77B" font-size="13" font-weight="700" font-family="sans-serif" letter-spacing="1.5">CUPBAP</text>
      </svg>`,
    cupbap_spam: `
      <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" class="food-svg">
        <defs>
          <linearGradient id="bg-spam" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#FCECE3"/>
            <stop offset="100%" stop-color="#F2D2BF"/>
          </linearGradient>
        </defs>
        <rect width="320" height="220" fill="url(#bg-spam)"/>
        <ellipse cx="160" cy="186" rx="90" ry="17" fill="rgba(55,25,15,0.14)"/>
        <path d="M86 96 L234 96 L214 178 C212 185 188 190 160 190 C132 190 108 185 106 178 Z" fill="#2A2623"/>
        <ellipse cx="160" cy="95" rx="74" ry="23" fill="#FCFBF7"/>
        <!-- Kimchi sautéed -->
        <path d="M102 92 Q122 72 146 84 Q142 104 114 104 Z" fill="#D1402A"/>
        <path d="M114 88 Q128 82 138 92" stroke="#F07C4A" stroke-width="2.5" fill="none"/>
        <!-- Glazed Spam slices -->
        <rect x="148" y="76" width="38" height="22" rx="5" transform="rotate(-8 148 76)" fill="#E36D63" stroke="#9C342B" stroke-width="1.5"/>
        <rect x="168" y="84" width="38" height="22" rx="5" transform="rotate(6 168 84)" fill="#EA7B71" stroke="#9C342B" stroke-width="1.5"/>
        <!-- Sunny egg yolk accent -->
        <ellipse cx="152" cy="100" rx="16" ry="8" fill="#FFFDF5"/>
        <circle cx="152" cy="99" r="7" fill="#F5A623"/>
        <rect x="194" y="80" width="20" height="4.5" rx="2" fill="#1E2B1E"/>
        <text x="160" y="148" text-anchor="middle" fill="#F9B59B" font-size="12" font-weight="700" font-family="sans-serif" letter-spacing="1.2">SPAM KIMCHI</text>
      </svg>`,
    ramyun: `
      <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" class="food-svg">
        <defs>
          <linearGradient id="bg-ramyun" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#FDF1E4"/>
            <stop offset="100%" stop-color="#F6D7B8"/>
          </linearGradient>
          <radialGradient id="broth-red" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stop-color="#E54D26"/>
            <stop offset="100%" stop-color="#9E2412"/>
          </radialGradient>
        </defs>
        <rect width="320" height="220" fill="url(#bg-ramyun)"/>
        <!-- Steam -->
        <path d="M124 58 Q116 42 128 28" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" opacity="0.7" fill="none"/>
        <path d="M160 52 Q152 34 166 20" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity="0.8" fill="none"/>
        <path d="M196 58 Q188 42 200 28" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" opacity="0.7" fill="none"/>
        <ellipse cx="160" cy="186" rx="95" ry="18" fill="rgba(80,25,10,0.15)"/>
        <!-- Bowl -->
        <path d="M74 96 L246 96 C242 152 208 182 160 182 C112 182 78 152 74 96 Z" fill="#C93B2B"/>
        <ellipse cx="160" cy="96" rx="86" ry="26" fill="#231F1D"/>
        <ellipse cx="160" cy="96" rx="79" ry="22" fill="url(#broth-red)"/>
        <!-- Wavy noodles -->
        <path d="M98 96 Q112 84 126 96 T154 96 T182 96 T210 96" stroke="#F7CE68" stroke-width="5.5" stroke-linecap="round" fill="none"/>
        <path d="M104 104 Q118 92 132 104 T160 104 T188 104 T214 104" stroke="#F3BD4F" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M114 88 Q128 78 142 88 T170 88 T198 88" stroke="#FBE08C" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <!-- Soft-boiled egg -->
        <ellipse cx="194" cy="90" rx="18" ry="12" transform="rotate(-12 194 90)" fill="#FFFDF8"/>
        <circle cx="195" cy="90" r="8" fill="#F59B1A"/>
        <!-- Scallions -->
        <circle cx="132" cy="86" r="4" fill="#509E4D"/>
        <circle cx="144" cy="94" r="3.5" fill="#63B85F"/>
        <circle cx="122" cy="96" r="3.5" fill="#468C48"/>
      </svg>`,
    tteokbokki: `
      <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" class="food-svg">
        <defs>
          <linearGradient id="bg-tteok" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#FDE9E6"/>
            <stop offset="100%" stop-color="#F7C7BE"/>
          </linearGradient>
        </defs>
        <rect width="320" height="220" fill="url(#bg-tteok)"/>
        <ellipse cx="160" cy="186" rx="78" ry="16" fill="rgba(90,20,10,0.14)"/>
        <path d="M98 92 L222 92 L206 178 C204 184 185 188 160 188 C135 188 116 184 114 178 Z" fill="#FFFFFF" stroke="#E5D5C8" stroke-width="2"/>
        <ellipse cx="160" cy="92" rx="62" ry="19" fill="#B82419"/>
        <!-- Glossy rice cakes -->
        <rect x="115" y="76" width="38" height="14" rx="7" transform="rotate(-18 115 76)" fill="#FFF4EC" stroke="#D93221" stroke-width="3"/>
        <rect x="150" y="72" width="42" height="14" rx="7" transform="rotate(14 150 72)" fill="#FFF4EC" stroke="#D93221" stroke-width="3"/>
        <rect x="128" y="90" width="40" height="14" rx="7" transform="rotate(6 128 90)" fill="#FFE6DD" stroke="#C82819" stroke-width="3"/>
        <rect x="166" y="88" width="36" height="14" rx="7" transform="rotate(-10 166 88)" fill="#FFE6DD" stroke="#C82819" stroke-width="3"/>
        <!-- Fishcake triangle -->
        <polygon points="154,68 174,80 144,86" fill="#E8B878" stroke="#C82819" stroke-width="2"/>
        <!-- Sesame & scallion -->
        <circle cx="142" cy="83" r="1.8" fill="#FFF8DC"/><circle cx="168" cy="80" r="1.8" fill="#FFF8DC"/>
        <circle cx="184" cy="92" r="1.8" fill="#FFF8DC"/><circle cx="155" cy="96" r="3" fill="#468C48"/>
        <!-- Pick -->
        <line x1="205" y1="36" x2="176" y2="82" stroke="#D29B5B" stroke-width="4" stroke-linecap="round"/>
      </svg>`,
    drinks: `
      <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" class="food-svg">
        <defs>
          <linearGradient id="bg-drink" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#E7F6F2"/>
            <stop offset="100%" stop-color="#C6E8E0"/>
          </linearGradient>
          <linearGradient id="tea-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#E68A2E"/>
            <stop offset="100%" stop-color="#B04D12"/>
          </linearGradient>
        </defs>
        <rect width="320" height="220" fill="url(#bg-drink)"/>
        <ellipse cx="160" cy="190" rx="74" ry="14" fill="rgba(15,60,55,0.14)"/>
        <!-- Straw -->
        <path d="M178 24 L162 110" stroke="#E0532C" stroke-width="7" stroke-linecap="round"/>
        <!-- Clear cup -->
        <path d="M112 68 L208 68 L194 182 C192 187 177 190 160 190 C143 190 128 187 126 182 Z" fill="rgba(255,255,255,0.65)" stroke="#FFFFFF" stroke-width="2.5"/>
        <path d="M116 84 L204 84 L191 178 C189 183 176 186 160 186 C144 186 131 183 129 178 Z" fill="url(#tea-grad)" opacity="0.92"/>
        <!-- Ice cubes -->
        <rect x="128" y="88" width="22" height="20" rx="4" transform="rotate(-12 128 88)" fill="rgba(255,255,255,0.55)"/>
        <rect x="160" y="90" width="24" height="22" rx="4" transform="rotate(14 160 90)" fill="rgba(255,255,255,0.5)"/>
        <rect x="142" y="112" width="22" height="20" rx="4" transform="rotate(6 142 112)" fill="rgba(255,255,255,0.4)"/>
        <!-- Lemon slice -->
        <circle cx="192" cy="78" r="14" fill="#F8D23A" stroke="#FFF8D2" stroke-width="2"/>
        <!-- Condensation droplets -->
        <circle cx="132" cy="144" r="2.5" fill="rgba(255,255,255,0.7)"/>
        <circle cx="182" cy="134" r="3" fill="rgba(255,255,255,0.7)"/>
        <circle cx="168" cy="158" r="2" fill="rgba(255,255,255,0.7)"/>
      </svg>`,
    combo: `
      <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" class="food-svg">
        <defs>
          <linearGradient id="bg-combo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#FFF2DC"/>
            <stop offset="100%" stop-color="#F7D59C"/>
          </linearGradient>
        </defs>
        <rect width="320" height="220" fill="url(#bg-combo)"/>
        <!-- Drink behind right -->
        <path d="M188 52 L248 52 L240 140 L196 140 Z" fill="#D97422" stroke="#FFFFFF" stroke-width="2"/>
        <line x1="226" y1="22" x2="218" y2="70" stroke="#C93B2B" stroke-width="5" stroke-linecap="round"/>
        <!-- Main bowl front left -->
        <ellipse cx="136" cy="182" rx="74" ry="15" fill="rgba(60,30,10,0.16)"/>
        <path d="M70 100 L202 100 L186 174 C184 180 162 184 136 184 C110 184 88 180 86 174 Z" fill="#292522"/>
        <ellipse cx="136" cy="100" rx="66" ry="20" fill="#FCFBF7"/>
        <circle cx="122" cy="96" r="14" fill="#D4822A"/>
        <circle cx="144" cy="94" r="15" fill="#E39738"/>
        <path d="M108 92 Q136 80 166 96" stroke="#FFF6DF" stroke-width="3" fill="none"/>
        <!-- Eomuk skewer accent -->
        <line x1="176" y1="54" x2="152" y2="108" stroke="#C89354" stroke-width="4" stroke-linecap="round"/>
        <path d="M162 66 Q178 72 164 82 Q150 92 166 98" stroke="#E5B976" stroke-width="11" stroke-linecap="round" fill="none"/>
        <!-- 5-SEC Badge -->
        <rect x="16" y="14" width="114" height="28" rx="14" fill="#C93B2B"/>
        <text x="73" y="32" text-anchor="middle" fill="#FFFFFF" font-size="12" font-weight="800" font-family="sans-serif">⚡ 5-SEC COMBO</text>
      </svg>`
  };

  function getFoodVisualHtml(item) {
    const img = (item.image_url || item.imageUrl || "").trim();
    if (img && !img.startsWith("svg:")) {
      return `<img src="${img}" alt="${item.name_en || item.name_ko}" class="menu-photo" loading="lazy"/>`;
    }
    const key = img.startsWith("svg:") ? img.slice(4) : (
      item.category === "eomuk" ? "combo" :
      item.category === "ramyun" ? "ramyun" :
      item.category === "tteokbokki" ? "tteokbokki" :
      item.category === "drink" ? "drinks" :
      item.category === "combo" ? "combo" : "cupbap_chicken"
    );
    return ARTWORK[key] || ARTWORK.combo;
  }

  root.KSnackFoodArt = { ARTWORK, getFoodVisualHtml };
})(typeof window !== "undefined" ? window : globalThis);
