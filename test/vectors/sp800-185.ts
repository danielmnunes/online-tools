/**
 * Verification vectors for NIST SP 800-185.
 *
 * Produced by Bouncy Castle 1.83 -- a Java implementation sharing no code
 * with @noble/hashes -- and cross-checked three further ways before being
 * written down here:
 *
 *  - The rows built from the NIST sample inputs (the four bytes 00 01 02 03,
 *    the 200-byte ramp, "Email Signature", "My Tagged Application") come out
 *    equal to the sample values published alongside SP 800-185.
 *  - Every KMAC row was recomputed with `openssl mac -macopt ... KMAC128`
 *    under OpenSSL 3.5.5, which agrees on all of them. The two rows with keys
 *    shorter than four bytes are the exception: OpenSSL refuses such keys, so
 *    Bouncy Castle stands alone there.
 *  - cSHAKE with an empty function name and an empty customization string is
 *    by definition SHAKE, and those rows agree with OpenSSL's SHAKE reached
 *    through node:crypto.
 *
 * One caveat found while generating these, and the reason no ParallelHash row
 * asks for a non-default output length: Bouncy Castle's
 * `ParallelHash.doFinal(out, off, outLen)` does not fold a non-default outLen
 * into the right_encode(L) that SP 800-185 section 6.2 requires, so it
 * disagrees with a from-specification implementation there. noble is the one
 * that is right; xof.test.ts re-derives ParallelHash from the specification
 * to show it.
 *
 * Inputs are named rather than inlined; test/xof.test.ts holds the table that
 * turns each name into bytes.
 */

export interface CShakeVector {
  readonly bits: 128 | 256;
  readonly message: string;
  readonly functionName: string;
  readonly customization: string;
  readonly dkLen: number;
  readonly expected: string;
}

export interface KmacVector {
  readonly bits: 128 | 256;
  readonly key: string;
  readonly message: string;
  readonly customization: string;
  readonly dkLen: number;
  readonly xof: boolean;
  readonly expected: string;
}

export interface TupleHashVector {
  readonly bits: 128 | 256;
  readonly tuple: string;
  readonly customization: string;
  readonly dkLen: number;
  readonly xof: boolean;
  readonly expected: string;
}

export interface ParallelHashVector {
  readonly bits: 128 | 256;
  readonly message: string;
  readonly customization: string;
  readonly blockLen: number;
  readonly dkLen: number;
  readonly xof: boolean;
  readonly expected: string;
}

export const CSHAKE_VECTORS: ReadonlyArray<CShakeVector> = [
  { bits: 128, message: "nist4", functionName: "", customization: "Email Signature", dkLen: 32, expected: "c1c36925b6409a04f1b504fcbca9d82b4017277cb5ed2b2065fc1d3814d5aaf5" },
  { bits: 128, message: "nist200", functionName: "", customization: "Email Signature", dkLen: 32, expected: "c5221d50e4f822d96a2e8881a961420f294b7b24fe3d2094baed2c6524cc166b" },
  { bits: 256, message: "nist4", functionName: "", customization: "Email Signature", dkLen: 64, expected: "d008828e2b80ac9d2218ffee1d070c48b8e4c87bff32c9699d5b6896eee0edd164020e2be0560858d9c00c037e34a96937c561a74c412bb4c746469527281c8c" },
  { bits: 256, message: "nist200", functionName: "", customization: "Email Signature", dkLen: 64, expected: "07dc27b11e51fbac75bc7b3c1d983e8b4b85fb1defaf218912ac86430273091727f42b17ed1df63e8ec118f04b23633c1dfb1574c8fb55cb45da8e25afb092bb" },
  { bits: 128, message: "seq0", functionName: "", customization: "", dkLen: 32, expected: "7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26" },
  { bits: 128, message: "seq167", functionName: "My Tagged Application", customization: "Custom", dkLen: 17, expected: "3a91be937c4bfe2d3ca49edf7414e97cb0" },
  { bits: 128, message: "seq168", functionName: "", customization: "Custom", dkLen: 168, expected: "d5b7ad42ea69933dc470018271c9b7baf3e164a945c8f4313dafe53f286d3f4ec7ba778e72be0344ab78353f7552cc98e258e896605fa09705ad790babb86e1813be23ba43ec853e07fb753ba20a196dcd3d64455ba5a21eeb59ee371757117ced8efc7a44786ae35b7727004d9ea23798696b428440836bc322e4928d4d47b5e60bb9fb9cb613ca13ef9c46abccc40908e21225a78d6f78a7a029a38fae00f9890174279da99b01" },
  { bits: 256, message: "seq135", functionName: "N", customization: "S", dkLen: 1, expected: "d1" },
  { bits: 256, message: "seq1000", functionName: "fn", customization: "personalisation", dkLen: 100, expected: "938d31c753214e540e07e47317c502573f2240c01974f3d11948d3ae9832b2bb6c41656276c912a5dabe725be0a5824eeb6437954f92bccf94667c0ee22c97e47c1355ac4b6d6dd38e6f2775171a3584847a679213bf10c72792629872634e185360b2fa" },
];

export const KMAC_VECTORS: ReadonlyArray<KmacVector> = [
  { bits: 128, key: "key32", message: "nist4", customization: "", dkLen: 32, xof: false, expected: "e5780b0d3ea6f7d3a429c5706aa43a00fadbd7d49628839e3187243f456ee14e" },
  { bits: 128, key: "key32", message: "nist4", customization: "My Tagged Application", dkLen: 32, xof: false, expected: "3b1fba963cd8b0b59e8c1a6d71888b7143651af8ba0a7070c0979e2811324aa5" },
  { bits: 128, key: "key32", message: "nist200", customization: "My Tagged Application", dkLen: 32, xof: false, expected: "1f5b4e6cca02209e0dcb5ca635b89a15e271ecc760071dfd805faa38f9729230" },
  { bits: 256, key: "key32", message: "nist4", customization: "My Tagged Application", dkLen: 64, xof: false, expected: "20c570c31346f703c9ac36c61c03cb64c3970d0cfc787e9b79599d273a68d2f7f69d4cc3de9d104a351689f27cf6f5951f0103f33f4f24871024d9c27773a8dd" },
  { bits: 256, key: "key32", message: "nist200", customization: "", dkLen: 64, xof: false, expected: "75358cf39e41494e949707927cee0af20a3ff553904c86b08f21cc414bcfd691589d27cf5e15369cbbff8b9a4c2eb17800855d0235ff635da82533ec6b759b69" },
  { bits: 256, key: "key32", message: "nist200", customization: "My Tagged Application", dkLen: 64, xof: false, expected: "b58618f71f92e1d56c1b8c55ddd7cd188b97b4ca4d99831eb2699a837da2e4d970fbacfde50033aea585f1a2708510c32d07880801bd182898fe476876fc8965" },
  { bits: 128, key: "key32", message: "nist4", customization: "", dkLen: 32, xof: true, expected: "cd83740bbd92ccc8cf032b1481a0f4460e7ca9dd12b08a0c4031178bacd6ec35" },
  { bits: 128, key: "key32", message: "nist200", customization: "My Tagged Application", dkLen: 32, xof: true, expected: "47026c7cd793084aa0283c253ef658490c0db61438b8326fe9bddf281b83ae0f" },
  { bits: 256, key: "key32", message: "nist4", customization: "My Tagged Application", dkLen: 64, xof: true, expected: "1755133f1534752aad0748f2c706fb5c784512cab835cd15676b16c0c6647fa96faa7af634a0bf8ff6df39374fa00fad9a39e322a7c92065a64eb1fb0801eb2b" },
  { bits: 256, key: "key32", message: "nist200", customization: "", dkLen: 64, xof: true, expected: "ff7b171f1e8a2b24683eed37830ee797538ba8dc563f6da1e667391a75edc02ca633079f81ce12a25f45615ec89972031d18337331d24ceb8f8ca8e6a19fd98b" },
  { bits: 128, key: "seq0", message: "seq0", customization: "", dkLen: 16, xof: false, expected: "e6aff27fef95903eb939bc3745730d34" },
  { bits: 128, key: "seq1", message: "seq500", customization: "tag", dkLen: 7, xof: true, expected: "85d5c6ce171e5a" },
  { bits: 256, key: "seq168", message: "seq136", customization: "long customization string", dkLen: 200, xof: true, expected: "d30c2a2e0e7b14897d945cfa9a4a9524ff52edf2db09c79a2d34acf394f68ada1c6aabd9bcfc9dfd37e85bba9957057c1bab1f1f90e834bf8a90a65b7f2879e326fb40f973629b90b1477624dd55bcc6f3bcdf570ea19aae84ae3d662eb3023bb72090ed60a2a098d690afdbec6ac8c4a81f56cf54dd67457c36619fa35daaae4cc55d456cb1a90a209db24af923dd908544734561117fe679de0d4670ec15f60296eb90b5ea09d41dcd196597200a23664713f4bfe80a0a1ddfc5ae05d5d95d9ffb4f60d7e0f560" },
];

export const TUPLEHASH_VECTORS: ReadonlyArray<TupleHashVector> = [
  { bits: 128, tuple: "t1", customization: "", dkLen: 32, xof: false, expected: "c5d8786c1afb9b82111ab34b65b2c0048fa64e6d48e263264ce1707d3ffc8ed1" },
  { bits: 128, tuple: "t1", customization: "My Tuple App", dkLen: 32, xof: false, expected: "75cdb20ff4db1154e841d758e24160c54bae86eb8c13e7f5f40eb35588e96dfb" },
  { bits: 128, tuple: "t2", customization: "My Tuple App", dkLen: 32, xof: false, expected: "e60f202c89a2631eda8d4c588ca5fd07f39e5151998deccf973adb3804bb6e84" },
  { bits: 256, tuple: "t1", customization: "My Tuple App", dkLen: 64, xof: false, expected: "147c2191d5ed7efd98dbd96d7ab5a11692576f5fe2a5065f3e33de6bba9f3aa1c4e9a068a289c61c95aab30aee1e410b0b607de3620e24a4e3bf9852a1d4367e" },
  { bits: 256, tuple: "t2", customization: "", dkLen: 64, xof: false, expected: "351d5ee026e44ce15b309187aa100263eebddf11b9ab130709a18d538b92518513ec7e9bc10c524cf408668b7ee7feaefb5927c7f59b82d249551c2182da860e" },
  { bits: 256, tuple: "t2", customization: "My Tuple App", dkLen: 64, xof: false, expected: "45000be63f9b6bfd89f54717670f69a9bc763591a4f05c50d68891a744bcc6e7d6d5b5e82c018da999ed35b0bb49c9678e526abd8e85c13ed254021db9e790ce" },
  { bits: 128, tuple: "t1", customization: "", dkLen: 32, xof: true, expected: "2f103cd7c32320353495c68de1a8129245c6325f6f2a3d608d92179c96e68488" },
  { bits: 128, tuple: "t1", customization: "My Tuple App", dkLen: 32, xof: true, expected: "3fc8ad69453128292859a18b6c67d7ad85f01b32815e22ce839c49ec374e9b9a" },
  { bits: 128, tuple: "t2", customization: "My Tuple App", dkLen: 32, xof: true, expected: "900fe16cad098d28e74d632ed852f99daab7f7df4d99e775657885b4bf76d6f8" },
  { bits: 256, tuple: "t1", customization: "My Tuple App", dkLen: 64, xof: true, expected: "6483cb3c9952eb20e830af4785851fc597ee3bf93bb7602c0ef6a65d741aeca7e63c3b128981aa05c6d27438c79d2754bb1b7191f125d6620fca12ce658b2442" },
  { bits: 256, tuple: "t2", customization: "", dkLen: 64, xof: true, expected: "9f15deb5af9092a2c0b3f6292c7b405c5ade81ea26e131ebe66faf786cdb80b119bae722d0d7a392c1807929bd2881c5db5142cbe4e30ab5d27600d6111e9006" },
  { bits: 256, tuple: "t2", customization: "My Tuple App", dkLen: 64, xof: true, expected: "0c59b11464f2336c34663ed51b2b950bec743610856f36c28d1d088d8a2446284dd09830a6a178dc752376199fae935d86cfdee5913d4922dfd369b66a53c897" },
  { bits: 128, tuple: "t3", customization: "abc", dkLen: 5, xof: true, expected: "985107731b" },
];

export const PARALLELHASH_VECTORS: ReadonlyArray<ParallelHashVector> = [
  { bits: 128, message: "p1", customization: "", blockLen: 8, dkLen: 32, xof: false, expected: "ba8dc1d1d979331d3f813603c67f72609ab5e44b94a0b8f9af46514454a2b4f5" },
  { bits: 128, message: "p1", customization: "Parallel Data", blockLen: 8, dkLen: 32, xof: false, expected: "fc484dcb3f84dceedc353438151bee58157d6efed0445a81f165e495795b7206" },
  { bits: 256, message: "p1", customization: "", blockLen: 8, dkLen: 64, xof: false, expected: "bc1ef124da34495e948ead207dd9842235da432d2bbc54b4c110e64c451105531b7f2a3e0ce055c02805e7c2de1fb746af97a1dd01f43b824e31b87612410429" },
  { bits: 256, message: "p1", customization: "Parallel Data", blockLen: 8, dkLen: 64, xof: false, expected: "cdf15289b54f6212b4bc270528b49526006dd9b54e2b6add1ef6900dda3963bb33a72491f236969ca8afaea29c682d47a393c065b38e29fae651a2091c833110" },
  { bits: 128, message: "p1", customization: "", blockLen: 8, dkLen: 32, xof: true, expected: "fe47d661e49ffe5b7d999922c062356750caf552985b8e8ce6667f2727c3c8d3" },
  { bits: 128, message: "p1", customization: "Parallel Data", blockLen: 8, dkLen: 32, xof: true, expected: "ea2a793140820f7a128b8eb70a9439f93257c6e6e79b4a540d291d6dae7098d7" },
  { bits: 256, message: "p1", customization: "", blockLen: 8, dkLen: 64, xof: true, expected: "c10a052722614684144d28474850b410757e3cba87651ba167a5cbddff7f466675fbf84bcae7378ac444be681d729499afca667fb879348bfdda427863c82f1c" },
  { bits: 256, message: "p1", customization: "Parallel Data", blockLen: 8, dkLen: 64, xof: true, expected: "538e105f1a22f44ed2f5cc1674fbd40be803d9c99bf5f8d90a2c8193f3fe6ea768e5c1a20987e2c9c65febed03887a51d35624ed12377594b5585541dc377efc" },
  { bits: 128, message: "seq0", customization: "", blockLen: 16, dkLen: 32, xof: false, expected: "7df97d11e2a432215dfeb10cf3455207719c397907e6f8faf5a7721dc373455b" },
  { bits: 128, message: "seq1000", customization: "chunky", blockLen: 137, dkLen: 32, xof: true, expected: "d7d91dc700923acb752163beb39eb5d9edbf76973103a5ca086629de8dcf00b0" },
  { bits: 256, message: "seq333", customization: "", blockLen: 1, dkLen: 64, xof: false, expected: "7b58d5a907569894dceddeecff37f5bc7ae881af1863da3e486c76e956f15a7714245cbbdb9059b514b1fdf857b0a5689c78d63e63994ff12770033ce74de0df" },
];
