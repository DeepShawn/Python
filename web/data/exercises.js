// 由 tools/build_question_bank.py 生成，请勿手工编辑。
export const QUESTION_BANK = {
  "version": 1,
  "questions": [
    {
      "id": "q-print-1",
      "stage": "零基础",
      "type": "single",
      "title": "下面哪一行代码能在屏幕上输出 Hello？",
      "options": [
        "echo Hello",
        "print(\"Hello\")",
        "printf(Hello)",
        "console.log(\"Hello\")"
      ],
      "explain": "Python 使用内置函数 print() 输出内容，字符串需要用引号包裹。",
      "check": {
        "algo": "PBKDF2-SHA256",
        "iterations": 120000,
        "salt": "a5c61ec08a5fd4c6e0b8de1060496016",
        "hashes": [
          "223c11e3f33ac30e8458873dffe5f9ea380efa235a49fd6d4d8c443e5cfac010"
        ]
      }
    },
    {
      "id": "q-type-1",
      "stage": "零基础",
      "type": "single",
      "title": "type(3.0) 的结果是？",
      "options": [
        "<class 'int'>",
        "<class 'float'>",
        "<class 'str'>",
        "<class 'double'>"
      ],
      "explain": "带小数点的数字是浮点数 float；Python 没有 double 类型。",
      "check": {
        "algo": "PBKDF2-SHA256",
        "iterations": 120000,
        "salt": "0c066097f0fa93ae11f4ddaa386b44fe",
        "hashes": [
          "736501a63eca32fc8f2d43883231191ad773f7c9b07f82f082c4468703e328bd"
        ]
      }
    },
    {
      "id": "q-container-1",
      "stage": "基础语法",
      "type": "multi",
      "title": "以下哪些是可变（mutable）类型？（多选）",
      "options": [
        "list",
        "tuple",
        "dict",
        "str",
        "set"
      ],
      "explain": "list、dict、set 可以原地修改；tuple 和 str 是不可变类型。",
      "check": {
        "algo": "PBKDF2-SHA256",
        "iterations": 120000,
        "salt": "c7ae5d7b295095560041687596c4349f",
        "hashes": [
          "bc084d735d2f0fcc3e6fb455eca898caf7f4c322c80e4228198db121fe1e9749"
        ]
      }
    },
    {
      "id": "q-fill-len",
      "stage": "基础语法",
      "type": "fill",
      "title": "填空：len([1, 2, 3]) 的值是 ____。",
      "explain": "len() 返回容器中元素的个数。",
      "check": {
        "algo": "PBKDF2-SHA256",
        "iterations": 120000,
        "salt": "affbab0fc44dbb57475f6690b6d101b6",
        "hashes": [
          "01c6988c3b248d25335207fdc30b82cddffaf60575bda000f4ea7204fda1cc92"
        ]
      }
    },
    {
      "id": "q-fill-range",
      "stage": "基础语法",
      "type": "fill",
      "title": "填空：list(range(2, 8, 3)) 的结果是 ____（按 Python 显示格式填写）。",
      "explain": "range(start, stop, step)：从 2 开始，每次加 3，不包含 8，所以是 2 和 5。",
      "check": {
        "algo": "PBKDF2-SHA256",
        "iterations": 120000,
        "salt": "52f73015e10976fc5f6462ffd33c1902",
        "hashes": [
          "984f3ce3b32c9f2e2b16bb8dfb7845a00fd68c41c062d14eb995ee2dbc7a59a5",
          "b7b15221f22d07d7c5336c2d2ffd7a3153eef659a6a0b3b810155878ee210241"
        ]
      }
    },
    {
      "id": "q-scope-1",
      "stage": "函数编程",
      "type": "single",
      "title": "作用域：下面代码的运行结果是？",
      "options": [
        "1",
        "None",
        "NameError",
        "0"
      ],
      "explain": "x 是函数内的局部变量，函数外无法访问，因此抛出 NameError。",
      "code": "def f():\n    x = 1\n\nf()\nprint(x)",
      "check": {
        "algo": "PBKDF2-SHA256",
        "iterations": 120000,
        "salt": "3e14dc24025917951af70e94f4880457",
        "hashes": [
          "626e5c47d28de5cc690f1d6924bd6d3d701834f285829c666966ccdb0cf4a689"
        ]
      }
    },
    {
      "id": "p-sum",
      "stage": "零基础",
      "type": "code_io",
      "title": "两数之和",
      "prompt": "读入两行整数 a 和 b，输出它们的和。",
      "starter": "a = int(input())\nb = int(input())\n# 在下面输出 a 与 b 的和\n",
      "cases": [
        {
          "stdin": "1\n2",
          "expected": "3"
        },
        {
          "stdin": "-5\n10",
          "expected": "5"
        },
        {
          "stdin": "100\n250",
          "expected": "350",
          "hidden": true
        }
      ]
    },
    {
      "id": "p-parity",
      "stage": "基础语法",
      "type": "code_io",
      "title": "判断奇偶",
      "prompt": "读入一个整数 n，若 n 为偶数输出“偶数”，否则输出“奇数”。",
      "starter": "n = int(input())\n",
      "cases": [
        {
          "stdin": "4",
          "expected": "偶数"
        },
        {
          "stdin": "7",
          "expected": "奇数"
        },
        {
          "stdin": "0",
          "expected": "偶数",
          "hidden": true
        },
        {
          "stdin": "-3",
          "expected": "奇数",
          "hidden": true
        }
      ]
    },
    {
      "id": "p-fact",
      "stage": "函数编程",
      "type": "code_func",
      "title": "阶乘函数",
      "prompt": "实现函数 fact(n)，返回 n 的阶乘（n ≥ 0，fact(0) = 1）。可以使用循环或递归。",
      "starter": "def fact(n):\n    # 在这里实现\n    pass\n",
      "cases": [
        {
          "call": "fact(0)",
          "expected": "1"
        },
        {
          "call": "fact(5)",
          "expected": "120"
        },
        {
          "call": "fact(10)",
          "expected": "3628800",
          "hidden": true
        }
      ]
    },
    {
      "id": "p-debug-avg",
      "stage": "函数编程",
      "type": "code_func",
      "title": "调试题：修复平均值函数",
      "prompt": "下面的 average(nums) 有错误，请修复它，使其返回列表的平均值；空列表返回 0。",
      "starter": "def average(nums):\n    total = 0\n    for n in nums:\n        total = n\n    return total / len(nums)\n",
      "cases": [
        {
          "call": "average([1, 2, 3])",
          "expected": "2.0"
        },
        {
          "call": "average([])",
          "expected": "0"
        },
        {
          "call": "average([10])",
          "expected": "10.0",
          "hidden": true
        }
      ]
    },
    {
      "id": "p-bubble",
      "stage": "算法与结构",
      "type": "code_func",
      "title": "冒泡排序",
      "prompt": "实现 bubble_sort(items)，返回升序排列的新列表，不要使用内置 sorted() 或 list.sort()。",
      "starter": "def bubble_sort(items):\n    data = list(items)\n    # 在这里实现冒泡排序\n    return data\n",
      "forbid": [
        "sorted(",
        ".sort("
      ],
      "cases": [
        {
          "call": "bubble_sort([3, 1, 2])",
          "expected": "[1, 2, 3]"
        },
        {
          "call": "bubble_sort([])",
          "expected": "[]"
        },
        {
          "call": "bubble_sort([5, -1, 5, 0])",
          "expected": "[-1, 0, 5, 5]",
          "hidden": true
        }
      ]
    }
  ]
};
