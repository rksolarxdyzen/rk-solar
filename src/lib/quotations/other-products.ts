/** Copy for the Premium “Our Other Products” page (RK flyers, Sep 2026). */
export const OTHER_PRODUCT_PAGE_COUNT = 4;

export type OtherProductCopy = {
  title: string;
  tagline?: string;
  features: string[];
  note?: string;
};

export const OTHER_PRODUCTS: OtherProductCopy[] = [
  {
    title: "Solar Water Heater",
    tagline: "ETC & FPC · residential and commercial",
    features: [
      "Provision for electric backup",
      "24 hours hot water",
      "Easy to install · eco friendly · maintenance free",
      "Best-in-class quality · strong body structure",
      "Anti-corrosive inner tank · rust-free technology",
      "Suitable for hard water",
    ],
    note: "Capacity 100–1000 Ltr",
  },
  {
    title: "Heat Pump",
    tagline: "24 hours hot water · lower operating cost",
    features: [
      "CK-1 ceramic coated inner tank",
      "Suitable for all types of water",
      "Eco-friendly refrigeration · silent operation",
      "Less maintenance · wide climatic range",
      "Apartments, bungalows, laundry, resorts, hostels",
      "Hospitals, process industries, canteen / cloud kitchen, pools",
    ],
    note: "Capacity 100 / 150 / 200 / 300 / 500 Ltr",
  },
  {
    title: "Solar Street Light",
    tagline: "CFL · LED · flood · all-in-one",
    features: [
      "Automatic dusk-to-dawn operation",
      "Variable working hours · cable-free",
      "Energy efficient · high transmission of light",
      "Environment friendly · low greenhouse gas",
      "Thermal efficiency · less wastage of light",
    ],
    note: "Options 12 / 18 / 24 / 30 W and 50 / 60 / 120 W",
  },
  {
    title: "Solar Water Pump",
    tagline: "AC & DC submersible",
    features: [
      "AC dual mode: solar by day, electric at night · inbuilt MPPT",
      "DC brushless PM motors for high efficiency",
      "Higher temperature & reverse polarity protection",
      "Over / under voltage protection",
      "Sensor-less dry running protection",
      "High durable and reliable",
    ],
    note: "Range 1 / 2 / 3 HP and 7.5 / 10 / 15 / 20 HP",
  },
];
